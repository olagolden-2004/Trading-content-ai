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


/* ==========================================
   VERIFY SUPABASE LOGIN
   ========================================== */

async function getAuthenticatedUser(req) {

  const authorization = req.headers.authorization;

  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.substring(7);

  if (!token) {
    return null;
  }

  if (!process.env.SUPABASE_URL) {
    console.error('SUPABASE_URL is missing.');
    return null;
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    console.error('SUPABASE_ANON_KEY is missing.');
    return null;
  }

  try {

    const response = await fetch(
      process.env.SUPABASE_URL + '/auth/v1/user',
      {
        method: 'GET',

        headers: {
          'Authorization': 'Bearer ' + token,
          'apikey': process.env.SUPABASE_ANON_KEY
        }
      }
    );

    if (!response.ok) {
      console.error(
        'Supabase authentication failed:',
        response.status
      );

      return null;
    }

    const user = await response.json();

    if (!user || !user.id) {
      return null;
    }

    return user;

  } catch (error) {

    console.error(
      'Authentication verification error:',
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

    const user = await getAuthenticatedUser(req);

    if (!user) {

      return res.status(401).json({
        error: 'Please log in before generating a post.'
      });

    }


    const { topic } = req.body;

    if (
      !topic ||
      typeof topic !== 'string' ||
      topic.trim() === ''
    ) {

      return res.status(400).json({
        error: 'Please enter a topic or idea first.'
      });

    }


    if (!process.env.GEMINI_API_KEY) {

      console.error(
        'GEMINI_API_KEY is missing.'
      );

      return res.status(500).json({
        error:
          'The AI service is not configured yet. Please add GEMINI_API_KEY in Render Environment Variables.'
      });

    }


    const prompt =
      AI_PROMPT + '\n' + topic.trim();


    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' +
      encodeURIComponent(
        process.env.GEMINI_API_KEY
      ),
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


    const data = await response.json();


    if (!response.ok) {

      console.error(
        'Gemini API error:',
        data
      );

      return res.status(
        response.status
      ).json({

        error:
          data?.error?.message ||
          'Gemini could not generate the post. Please try again.'

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

      console.error(
        'Unexpected Gemini response:',
        data
      );

      return res.status(500).json({

        error:
          'The AI returned an empty response. Please try again.'

      });

    }


    res.json({

      content: content

    });


  } catch (error) {

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


/* ==========================================
   HEALTH CHECK
   ========================================== */

app.get('/health', (req, res) => {

  res.json({

    status: 'ok',

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
