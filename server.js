const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));


// ============================================================
// ENVIRONMENT CONFIGURATION
// ============================================================

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL = 'gemini-3.5-flash-lite';


// ============================================================
// AI PROMPT
// ============================================================

const AI_PROMPT = `
You are "TradeContentAI", a professional AI social media content creator.

Your job is to create ONE high-quality social media post based ONLY on the user's request.

IMPORTANT:
- The user's request determines the topic.
- NEVER automatically turn the user's request into forex, trading, investing, or finance content.
- NEVER assume the user is a trader.
- If the user asks about fashion, create fashion content.
- If the user asks about food, create food content.
- If the user asks about business, create business content.
- If the user asks about fitness, create fitness content.
- If the user asks about technology, create technology content.
- If the user asks about relationships, create relationship content.
- If the user asks about motivation, create motivational content.
- If the user asks about forex or trading, then create forex/trading content.
- Follow the user's topic exactly.

The post should be suitable for social media platforms such as:
Instagram, TikTok, Facebook, X/Twitter, or LinkedIn.

CONTENT RULES:

1. Create EXACTLY ONE post.
2. Create a strong attention-grabbing hook.
3. Give useful and relevant information about the user's actual topic.
4. Do not add unrelated subjects.
5. Do not force the content into a particular niche.
6. Do not make unrealistic promises.
7. Do not guarantee results, income, followers, or success.
8. End with a clear CTA such as "Comment ___", "DM me ___", "Save this post", or "Share this with someone who needs it."
9. Give exactly 3 relevant hashtags.
10. Give one caption.
11. Make the content original and natural.
12. Do NOT create POST 2 or POST 3.
13. Do NOT provide multiple versions.
14. Return ONLY ONE complete post.

Use EXACTLY this format:

POST:
TYPE:

HOOK:

BODY:

CTA:

CAPTION:

HASHTAGS:

USER REQUEST:
`;


// ============================================================
// BASIC CONFIGURATION CHECK
// ============================================================

function checkServerConfiguration() {

    const missing = [];

    if (!SUPABASE_URL) {
        missing.push('SUPABASE_URL');
    }

    if (!SUPABASE_ANON_KEY) {
        missing.push('SUPABASE_ANON_KEY');
    }

    if (!GEMINI_API_KEY) {
        missing.push('GEMINI_API_KEY');
    }

    return missing;
}


// ============================================================
// GET ACCESS TOKEN
// ============================================================

function getAccessToken(req) {

    const authorization =
        req.headers.authorization || '';

    if (!authorization) {
        return null;
    }

    if (!authorization.startsWith('Bearer ')) {
        return null;
    }

    const token =
        authorization.substring(7).trim();

    return token || null;
}


// ============================================================
// CHECK SUPABASE LOGIN
// ============================================================

async function getAuthenticatedUser(accessToken) {

    if (!accessToken) {

        return {
            user: null,
            error:
                'Please log in before using TradeContentAI.'
        };
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {

        console.error(
            'Supabase environment variables are missing.'
        );

        return {
            user: null,
            error:
                'Supabase is not configured correctly on the server.'
        };
    }

    try {

        const response = await fetch(
            `${SUPABASE_URL}/auth/v1/user`,
            {
                method: 'GET',

                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        let data = null;

        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok || !data?.id) {

            return {
                user: null,
                error:
                    'Your login session is invalid or has expired. Please log in again.'
            };
        }

        return {
            user: data,
            error: null
        };

    } catch (error) {

        console.error(
            'Supabase authentication error:',
            error
        );

        return {
            user: null,
            error:
                'Could not verify your login session.'
        };
    }
}


// ============================================================
// RESERVE ONE GENERATION
// ============================================================

async function reserveGeneration(accessToken) {

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {

        return {
            allowed: false,
            error:
                'Supabase is not configured correctly on the server.'
        };
    }

    if (!accessToken) {

        return {
            allowed: false,
            error:
                'Please log in before generating content.'
        };
    }

    try {

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/rpc/reserve_generation`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                },

                body: JSON.stringify({})
            }
        );

        let data = null;

        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {

            console.error(
                'Generation reservation error:',
                data
            );

            return {
                allowed: false,
                error:
                    data?.message ||
                    data?.error ||
                    'Could not check your daily generation limit.'
            };
        }

        if (!data || typeof data !== 'object') {

            console.error(
                'Invalid reserve_generation response:',
                data
            );

            return {
                allowed: false,
                error:
                    'The generation limit system returned an invalid response.'
            };
        }

        return data;

    } catch (error) {

        console.error(
            'Generation reservation request failed:',
            error
        );

        return {
            allowed: false,
            error:
                'Could not connect to the generation limit system.'
        };
    }
}


// ============================================================
// GENERATE CONTENT WITH GEMINI
// ============================================================

async function generateWithGemini(topic) {

    if (!GEMINI_API_KEY) {

        return {
            success: false,
            error:
                'The AI service is not configured yet. Please add GEMINI_API_KEY in Render Environment Variables.'
        };
    }

    const prompt =
        `${AI_PROMPT}\n${topic.trim()}`;

    const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    try {

        const response = await fetch(
            endpoint,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({

                    contents: [
                        {
                            role: 'user',

                            parts: [
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ],

                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 1200
                    }

                })
            }
        );

        let data = null;

        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {

            console.error(
                'Gemini API error:',
                data
            );

            let errorMessage =
                'Gemini could not generate the post. Please try again.';

            if (data?.error?.message) {
                errorMessage = data.error.message;
            }

            return {
                success: false,
                error: errorMessage,
                status: response.status
            };
        }

        const content =
            data?.candidates?.[0]?.content?.parts
                ?.map(part => part?.text || '')
                .join('')
                .trim();

        if (!content) {

            console.error(
                'Gemini returned no usable content:',
                data
            );

            return {
                success: false,
                error:
                    'The AI returned an empty response. Please try again.'
            };
        }

        return {
            success: true,
            content
        };

    } catch (error) {

        console.error(
            'Gemini request failed:',
            error
        );

        return {
            success: false,
            error:
                'Could not connect to the AI service. Please try again.'
        };
    }
}


// ============================================================
// SAVE SUCCESSFUL GENERATION
// ============================================================

async function saveGeneration(
    accessToken,
    userId,
    topic,
    content
) {

    if (
        !SUPABASE_URL ||
        !SUPABASE_ANON_KEY ||
        !accessToken ||
        !userId ||
        !topic ||
        !content
    ) {

        return {
            success: false,
            error:
                'Generation save information is incomplete.'
        };
    }

    try {

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/rpc/save_generation`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                },

                body: JSON.stringify({
                    p_user_id: userId,
                    p_topic: topic,
                    p_content: content
                })
            }
        );

        let data = null;

        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {

            console.error(
                'save_generation error:',
                data
            );

            return {
                success: false,
                error:
                    data?.message ||
                    data?.error ||
                    'Could not save the generated post.'
            };
        }

        return {
            success: true,
            data
        };

    } catch (error) {

        console.error(
            'save_generation request failed:',
            error
        );

        return {
            success: false,
            error:
                'Could not connect to the generation history system.'
        };
    }
}


// ============================================================
// OWNER DASHBOARD DATA
// ============================================================

async function getOwnerDashboard(accessToken) {

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {

        return {
            success: false,
            error:
                'Supabase is not configured correctly on the server.'
        };
    }

    try {

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/rpc/get_owner_dashboard`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                },

                body: JSON.stringify({})
            }
        );

        let data = null;

        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {

            console.error(
                'Owner dashboard error:',
                data
            );

            return {
                success: false,
                error:
                    data?.message ||
                    data?.error ||
                    'Could not load the owner dashboard.'
            };
        }

        return {
            success: true,
            data
        };

    } catch (error) {

        console.error(
            'Owner dashboard request failed:',
            error
        );

        return {
            success: false,
            error:
                'Could not connect to the owner dashboard.'
        };
    }
}


// ============================================================
// OWNER DASHBOARD ROUTE
// ============================================================

app.get('/owner-dashboard', async (req, res) => {

    try {

        const accessToken =
            getAccessToken(req);

        const authResult =
            await getAuthenticatedUser(accessToken);

        if (!authResult.user) {

            return res.status(401).json({
                success: false,
                error: authResult.error
            });
        }

        const dashboard =
            await getOwnerDashboard(accessToken);

        if (!dashboard.success) {

            return res.status(403).json({
                success: false,
                error: dashboard.error
            });
        }

        return res.json({
            success: true,
            dashboard: dashboard.data
        });

    } catch (error) {

        console.error(
            'Owner dashboard route error:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                'Something went wrong loading the owner dashboard.'
        });
    }
});


// ============================================================
// GENERATE POST ROUTE
// ============================================================

app.post('/generate', async (req, res) => {

    try {

        // ------------------------------------------------------
        // CHECK SERVER CONFIGURATION
        // ------------------------------------------------------

        const missingConfig =
            checkServerConfiguration();

        if (missingConfig.length > 0) {

            console.error(
                'Missing server configuration:',
                missingConfig
            );

            return res.status(500).json({
                success: false,
                error:
                    'The server is not fully configured. Missing: ' +
                    missingConfig.join(', ')
            });
        }


        // ------------------------------------------------------
        // VALIDATE REQUEST
        // ------------------------------------------------------

        const topic =
            typeof req.body?.topic === 'string'
                ? req.body.topic.trim()
                : '';

        if (!topic) {

            return res.status(400).json({
                success: false,
                error:
                    'Please enter a topic or idea first.'
            });
        }


        if (topic.length > 5000) {

            return res.status(400).json({
                success: false,
                error:
                    'Your topic is too long. Please keep it under 5,000 characters.'
            });
        }


        // ------------------------------------------------------
        // GET ACCESS TOKEN
        // ------------------------------------------------------

        const accessToken =
            getAccessToken(req);


        // ------------------------------------------------------
        // VERIFY LOGIN
        // ------------------------------------------------------

        const authResult =
            await getAuthenticatedUser(accessToken);

        if (!authResult.user) {

            return res.status(401).json({
                success: false,
                error:
                    authResult.error
            });
        }


        // ------------------------------------------------------
        // RESERVE ONE GENERATION
        //
        // reserve_generation() is the single source of truth
        // for the daily generation limit.
        // ------------------------------------------------------

        const reservation =
            await reserveGeneration(accessToken);


        if (!reservation?.allowed) {

            return res.status(429).json({

                success: false,

                error:
                    reservation?.message ||
                    reservation?.error ||
                    'You have reached your daily generation limit.',

                remaining:
                    Number.isFinite(
                        Number(reservation?.remaining)
                    )
                        ? Number(reservation.remaining)
                        : 0,

                reward_used:
                    reservation?.reward_used === true
            });
        }


        // ------------------------------------------------------
        // GENERATE AI CONTENT
        // ------------------------------------------------------

        const aiResult =
            await generateWithGemini(topic);


        // ------------------------------------------------------
        // GEMINI FAILED
        // ------------------------------------------------------

        if (!aiResult.success) {

            /*
             * The generation has already been reserved.
             *
             * We do not attempt a fake refund here.
             * A safe refund/cancellation function can be added
             * separately later.
             */

            return res.status(
                aiResult.status === 429
                    ? 429
                    : 502
            ).json({

                success: false,

                error:
                    aiResult.error ||
                    'The AI could not generate your post. Please try again.',

                generation_reserved: true,

                remaining:
                    reservation.remaining ?? null
            });
        }


        // ------------------------------------------------------
        // SAVE SUCCESSFUL POST
        //
        // This saves the generated content/history.
        // It does NOT replace reserve_generation() as the
        // generation-limit system.
        // ------------------------------------------------------

        const saved =
            await saveGeneration(
                accessToken,
                authResult.user.id,
                topic,
                aiResult.content
            );


        if (!saved.success) {

            console.error(
                'Generated post could not be saved:',
                saved.error
            );

            return res.status(500).json({

                success: false,

                error:
                    'The post was generated, but we could not save it. Please try again.',

                generation_reserved: true,

                remaining:
                    reservation.remaining ?? null
            });
        }


        // ------------------------------------------------------
        // SUCCESS
        // ------------------------------------------------------

        return res.status(200).json({

            success: true,

            content:
                aiResult.content,

            remaining:
                reservation.remaining ?? null,

            reward_used:
                reservation.reward_used === true,

            request_id:
                reservation.request_id ?? null,

            message:
                reservation.reward_used === true
                    ? 'Post generated using your ad reward.'
                    : 'Post generated successfully.'
        });

    } catch (error) {

        console.error(
            'Generate route error:',
            error
        );

        return res.status(500).json({

            success: false,

            error:
                'Something went wrong while generating your post. Please try again.'
        });
    }
});


// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/health', (req, res) => {

    const missingConfig =
        checkServerConfiguration();

    return res.status(
        missingConfig.length === 0
            ? 200
            : 503
    ).json({

        status:
            missingConfig.length === 0
                ? 'ok'
                : 'error',

        message:
            missingConfig.length === 0
                ? 'TradeContentAI server is running.'
                : 'TradeContentAI server is running, but configuration is incomplete.',

        ai_model:
            GEMINI_MODEL,

        configuration:
            missingConfig.length === 0
                ? 'complete'
                : 'incomplete',

        missing:
            missingConfig
    });
});


// ============================================================
// UNKNOWN API ROUTE
// ============================================================

app.use('/',
    (req, res, next) => {

        if (
            req.path === '/generate' ||
            req.path === '/health' ||
            req.path === '/owner-dashboard'
        ) {
            return next();
        }

        if (
            req.path.startsWith('/api/')
        ) {

            return res.status(404).json({

                success: false,

                error:
                    'API endpoint not found.'
            });
        }

        return next();
    }
);


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {

    console.error(
        'Unhandled Express error:',
        error
    );

    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({

        success: false,

        error:
            'An unexpected server error occurred.'
    });
});


// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {

    console.log(
        '=========================================='
    );

    console.log(
        'TradeContentAI server started'
    );

    console.log(
        `Port: ${PORT}`
    );

    console.log(
        `AI model: ${GEMINI_MODEL}`
    );

    console.log(
        `Supabase configured: ${Boolean(
            SUPABASE_URL &&
            SUPABASE_ANON_KEY
        )}`
    );

    console.log(
        `Gemini configured: ${Boolean(
            GEMINI_API_KEY
        )}`
    );

    console.log(
        '=========================================='
    );
});
