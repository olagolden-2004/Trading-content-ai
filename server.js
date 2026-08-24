const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

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


/* =========================================================
   SUPABASE CONFIGURATION
   ========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;


/* =========================================================
   VERIFY SUPABASE USER
   ========================================================= */

async function getSupabaseUser(accessToken) {

  if (!accessToken) {
    return null;
  }

  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  return await response.json();
}


/* =========================================================
   GENERATE POST
   ========================================================= */

app.post('/generate', async (req, res) => {

  try {

    const { topic } = req.body;

    if (!topic || typeof topic !== 'string' || topic.trim() === '') {

      return res.status(400).json({
        error: 'Please enter a topic or idea first.'
      });

    }


    /* -----------------------------------------------------
       CHECK SUPABASE CONFIGURATION
       ----------------------------------------------------- */

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {

      console.error(
        'Supabase server environment variables are missing.'
      );

      return res.status(500).json({
        error: 'The server authentication system is not configured yet.'
      });

    }


    /* -----------------------------------------------------
       GET LOGIN TOKEN
       ----------------------------------------------------- */

    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {

      return res.status(401).json({
        error: 'Please log in before generating a post.'
      });

    }

    const accessToken =
      authHeader.substring('Bearer '.length).trim();


    /* -----------------------------------------------------
       VERIFY USER
       ----------------------------------------------------- */

    const user =
      await getSupabaseUser(accessToken);

    if (!user || !user.id) {

      return res.status(401).json({
        error: 'Your login session is invalid or expired. Please log in again.'
      });

    }


    /* -----------------------------------------------------
       CHECK GEMINI CONFIGURATION
       ----------------------------------------------------- */

    if (!process.env.GEMINI_API_KEY) {

      console.error(
        'GEMINI_API_KEY is missing.'
      );

      return res.status(500).json({
        error:
          'The AI service is not configured yet. Please add GEMINI_API_KEY in Render Environment Variables.'
      });

    }


    /* -----------------------------------------------------
       CHECK + USE DAILY GENERATION
       ----------------------------------------------------- */

    const generationResponse =
      await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/use_generation`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization':
              `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },

          body: JSON.stringify({
            requested_topic: topic.trim()
          })
        }
      );


    const generationResult =
      await generationResponse.json();


    if (!generationResponse.ok) {

      console.error(
        'Supabase generation error:',
        generationResult
      );

      return res.status(500).json({
        error:
          'Could not check your daily generation limit. Please try again.'
      });

    }


    if (!generationResult.allowed) {

      if (
        generationResult.reason ===
        'DAILY_LIMIT_REACHED'
      ) {

        return res.status(429).json({

          error:
            "You've used all 3 free generations for today. Come back tomorrow.",

          used:
            generationResult.used || 3,

          remaining: 0

        });

      }


      return res.status(401).json({
        error: 'Please log in before generating a post.'
      });

    }


    /* -----------------------------------------------------
       GENERATE WITH GEMINI
       ----------------------------------------------------- */

    const prompt =
      AI_PROMPT + topic.trim();


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
        'Gemini API error:',
        data
      );

      return res.status(
        geminiResponse.status
      ).json({

        error:
          data?.error?.message ||
          'Gemini could not generate the post. Please try again.'

      });

    }


    /* -----------------------------------------------------
       GET GENERATED CONTENT
       ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       SAVE GENERATION HISTORY
       ----------------------------------------------------- */

    const historyResponse =
      await fetch(
        `${SUPABASE_URL}/rest/v1/generation_history`,
        {
          method: 'POST',

          headers: {

            'Content-Type':
              'application/json',

            'apikey':
              SUPABASE_SERVICE_ROLE_KEY,

            'Authorization':
              `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

            'Prefer':
              'return=minimal'

          },

          body: JSON.stringify({

            user_id:
              user.id,

            topic:
              topic.trim(),

            content:
              content

          })

        }
      );


    if (!historyResponse.ok) {

      const historyError =
        await historyResponse.text();

      console.error(
        'History save error:',
        historyError
      );

      // The generation itself succeeded,
      // so we still return the content.
    }


    /* -----------------------------------------------------
       SUCCESS
       ----------------------------------------------------- */

    res.json({

      content:
        content,

      used:
        generationResult.used,

      remaining:
        generationResult.remaining

    });

  }

  catch (error) {

    console.error(
      'Server error:',
      error
    );

    res.status(500).json({

      error:
        error?.message ||
        'Something went wrong while generating your post.'

    });

  }

});


/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get('/health', (req, res) => {

  res.json({

    status: 'ok',

    message:
      'TradeContentAI server is running.'

  });

});


/* =========================================================
   START SERVER
   ========================================================= */

const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `TradeContentAI server running on port ${PORT}`
  );

});
