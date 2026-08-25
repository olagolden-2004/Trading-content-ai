const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ==========================================
// CONFIGURATION
// ==========================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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


// ==========================================
// CHECK SUPABASE LOGIN
// ==========================================

async function getAuthenticatedUser(accessToken) {

    if (!accessToken) {
        return {
            user: null,
            error: 'Please log in before using TradeContentAI.'
        };
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('Supabase environment variables are missing.');

        return {
            user: null,
            error: 'Supabase is not configured correctly on the server.'
        };
    }

    try {

        const response = await fetch(
            SUPABASE_URL + '/auth/v1/user',
            {
                method: 'GET',

                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + accessToken
                }
            }
        );

        const data = await response.json();

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

        console.error('Supabase auth error:', error);

        return {
            user: null,
            error: 'Could not verify your login session.'
        };
    }
}


// ==========================================
// RESERVE ONE GENERATION
// ==========================================

async function reserveGeneration(accessToken) {

    try {

        const response = await fetch(
            SUPABASE_URL + '/rest/v1/rpc/reserve_generation',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + accessToken
                },

                body: JSON.stringify({})
            }
        );

        const data = await response.json();

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


// ==========================================
// OWNER DASHBOARD DATA
// ==========================================

async function getOwnerDashboard(accessToken) {

    try {

        const response = await fetch(
            SUPABASE_URL + '/rest/v1/rpc/get_owner_dashboard',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + accessToken
                },

                body: JSON.stringify({})
            }
        );

        const data = await response.json();

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
            data: data
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

// ==========================================
// OWNER DASHBOARD
// ==========================================

app.get('/owner-dashboard', async (req, res) => {

    try {

        const authorization =
            req.headers.authorization || '';

        const accessToken =
            authorization.startsWith('Bearer ')
                ? authorization.substring(7)
                : null;

        const authResult =
            await getAuthenticatedUser(accessToken);

        if (!authResult.user) {

            return res.status(401).json({
                error: authResult.error
            });
        }

        const dashboard =
            await getOwnerDashboard(accessToken);

        if (!dashboard.success) {

            return res.status(403).json({
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
            error:
                'Something went wrong loading the owner dashboard.'
        });
    }
});
// ==========================================
// GENERATE POST
// ==========================================

app.post('/generate', async (req, res) => {

    try {

        const { topic } = req.body;

        // --------------------------------------
        // Validate topic
        // --------------------------------------

        if (
            !topic ||
            typeof topic !== 'string' ||
            topic.trim() === ''
        ) {

            return res.status(400).json({
                error:
                    'Please enter a topic or idea first.'
            });
        }


        // --------------------------------------
        // Get user access token
        // --------------------------------------

        const authorization =
            req.headers.authorization || '';

        const accessToken =
            authorization.startsWith('Bearer ')
                ? authorization.substring(7)
                : null;


        // --------------------------------------
        // Verify logged-in user
        // --------------------------------------

        const authResult =
            await getAuthenticatedUser(accessToken);

        if (!authResult.user) {

            return res.status(401).json({
                error: authResult.error
            });
        }


        // --------------------------------------
        // Check AI configuration
        // --------------------------------------

        if (!GEMINI_API_KEY) {

            console.error(
                'GEMINI_API_KEY is missing.'
            );

            return res.status(500).json({
                error:
                    'The AI service is not configured yet. Please add GEMINI_API_KEY in Render Environment Variables.'
            });
        }


        // --------------------------------------
        // Check Supabase configuration
        // --------------------------------------

        if (
            !SUPABASE_URL ||
            !SUPABASE_ANON_KEY
        ) {

            return res.status(500).json({
                error:
                    'Supabase is not configured correctly on the server.'
            });
        }


        // --------------------------------------
        // SECURE GENERATION CHECK
        // --------------------------------------

        const reservation =
            await reserveGeneration(accessToken);

        if (!reservation.allowed) {

            return res.status(429).json({
                error:
                    reservation.message ||
                    reservation.error ||
                    'You have reached your daily generation limit.'
            });
        }


        // --------------------------------------
        // Generate AI content
        // --------------------------------------

        const prompt =
            AI_PROMPT + topic.trim();

        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' +
            encodeURIComponent(GEMINI_API_KEY),
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({

                    contents: [
                        {
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


        const data =
            await response.json();


        // --------------------------------------
        // Gemini error
        // --------------------------------------

        if (!response.ok) {

            console.error(
                'Gemini API error:',
                data
            );

            return res.status(502).json({
                error:
                    data?.error?.message ||
                    'Gemini could not generate the post. Please try again.'
            });
        }


        // --------------------------------------
        // Extract content
        // --------------------------------------

        const content =
            data?.candidates?.[0]?.content?.parts
                ?.map(part => part.text || '')
                .join('')
                .trim();


        if (!content) {

            console.error(
                'Unexpected Gemini response:',
                data
            );

            return res.status(500).json({
                error:
                    'The AI returned an empty response. Please try again.'
            });
        }


        // --------------------------------------
        // Success
        // --------------------------------------

        return res.json({

            content: content,

            remaining:
                reservation.remaining ?? null

        });

    } catch (error) {

        console.error(
            'Server error:',
            error
        );

        return res.status(500).json({

            error:
                error?.message ||
                'Something went wrong while generating your post.'

        });
    }
});


// ==========================================
// OWNER DASHBOARD ROUTE
// ==========================================

app.get('/owner-dashboard', async (req, res) => {

    try {

        const authorization =
            req.headers.authorization || '';

        const accessToken =
            authorization.startsWith('Bearer ')
                ? authorization.substring(7)
                : null;


        // --------------------------------------
        // Verify login
        // --------------------------------------

        const authResult =
            await getAuthenticatedUser(accessToken);

        if (!authResult.user) {

            return res.status(401).json({
                error: authResult.error
            });
        }


        // --------------------------------------
        // Get owner dashboard
        // --------------------------------------

        const dashboard =
            await getOwnerDashboard(accessToken);


        if (!dashboard.success) {

            return res.status(403).json({
                error:
                    dashboard.error ||
                    'Access denied.'
            });
        }


        // --------------------------------------
        // Return dashboard
        // --------------------------------------

        return res.json(
            dashboard.data
        );

    } catch (error) {

        console.error(
            'Owner dashboard route error:',
            error
        );

        return res.status(500).json({

            error:
                'Something went wrong while loading the owner dashboard.'

        });
    }
});


// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/health', (req, res) => {

    res.json({

        status: 'ok',

        message:
            'TradeContentAI server is running.'

    });

});


// ==========================================
// START SERVER
// ==========================================

const PORT =
    process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `TradeContentAI server running on port ${PORT}`
    );

});
