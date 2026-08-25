const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static('public'));


/* ==========================================
   AI PROMPT
   ========================================== */

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
8. End with a clear CTA.
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


/* ==========================================
   VERIFY SUPABASE USER
   ========================================== */

async function getAuthenticatedUser(req) {

    const authorization =
        req.headers.authorization;

    if (!authorization) {
        return null;
    }

    if (!authorization.startsWith('Bearer ')) {
        return null;
    }

    const token =
        authorization.substring(7).trim();

    if (!token) {
        return null;
    }

    try {

        const response = await fetch(
            process.env.SUPABASE_URL +
            '/auth/v1/user',
            {
                method: 'GET',
                headers: {
                    'Authorization':
                        'Bearer ' + token,
                    'apikey':
                        process.env.SUPABASE_ANON_KEY
                }
            }
        );

        if (!response.ok) {
            return null;
        }

        const user =
            await response.json();

        if (!user || !user.id) {
            return null;
        }

        return user;

    } catch (error) {

        console.error(
            'Authentication error:',
            error
        );

        return null;
    }
}


/* ==========================================
   GENERATE POST
   ========================================== */

app.post('/generate', async (req, res) => {

    try {

        /* --------------------------------------
           1. VERIFY LOGIN
           -------------------------------------- */

        const user =
            await getAuthenticatedUser(req);

        if (!user) {

            return res.status(401).json({
                error:
                    'Please log in before generating a post.'
            });

        }


        /* --------------------------------------
           2. CHECK TOPIC
           -------------------------------------- */

        const { topic } =
            req.body;

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


        /* --------------------------------------
           3. CHECK GEMINI
           -------------------------------------- */

        if (!process.env.GEMINI_API_KEY) {

            return res.status(500).json({
                error:
                    'The AI service is not configured.'
            });

        }


        /* --------------------------------------
           4. GENERATE WITH GEMINI
           -------------------------------------- */

        const prompt =
            AI_PROMPT +
            '\n' +
            topic.trim();


        const geminiResponse =
            await fetch(
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' +
                encodeURIComponent(
                    process.env.GEMINI_API_KEY
                ),
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
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
            await geminiResponse.json();


        if (!geminiResponse.ok) {

            console.error(
                'Gemini error:',
                data
            );

            return res.status(
                geminiResponse.status
            ).json({

                error:
                    data?.error?.message ||
                    'Gemini could not generate the post.'

            });

        }


        const content =
            data?.candidates?.[0]?.content?.parts
                ?.map(
                    part => part.text || ''
                )
                .join('')
                .trim();


        if (!content) {

            return res.status(500).json({
                error:
                    'The AI returned an empty response.'
            });

        }


        /* --------------------------------------
           5. SECURELY SAVE + CHECK DAILY LIMIT
           -------------------------------------- */

        const saveResponse =
            await fetch(
                process.env.SUPABASE_URL +
                '/rest/v1/rpc/save_generation',
                {
                    method: 'POST',

                    headers: {

                        'Content-Type':
                            'application/json',

                        'apikey':
                            process.env.SUPABASE_SERVICE_ROLE_KEY,

                        'Authorization':
                            'Bearer ' +
                            process.env.SUPABASE_SERVICE_ROLE_KEY

                    },

                    body: JSON.stringify({

                        p_user_id:
                            user.id,

                        p_topic:
                            topic.trim(),

                        p_content:
                            content

                    })
                }
            );


        const saveResult =
            await saveResponse.json();


        if (!saveResponse.ok) {

            console.error(
                'Supabase save_generation error:',
                saveResult
            );

            return res.status(500).json({
                error:
                    'Could not record this generation. Please try again.'
            });

        }


        /* --------------------------------------
           6. LIMIT REACHED
           -------------------------------------- */

        if (!saveResult.allowed) {

            return res.status(429).json({

                error:
                    "You've used all 3 free generations for today. Come back tomorrow.",

                used:
                    saveResult.used,

                remaining:
                    0

            });

        }


        /* --------------------------------------
           7. SUCCESS
           -------------------------------------- */

        return res.json({

            content:
                content,

            used:
                saveResult.used,

            remaining:
                saveResult.remaining

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


/* ==========================================
   HEALTH CHECK
   ========================================== */

app.get('/health', (req, res) => {

    res.json({

        status:
            'ok',

        message:
            'TradeContentAI server is running.'

    });

});


/* ==========================================
   START SERVER
   ========================================== */

const PORT =
    process.env.PORT || 3000;


app.listen(PORT, () => {

    console.log(
        `TradeContentAI server running on port ${PORT}`
    );

});
