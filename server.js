const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const AI_PROMPT = `
You are "TradeContentAI", a professional social media manager for forex traders.

Your job is to create ONE high-quality social media post for forex traders.

The post can be used on:
- Instagram
- TikTok
- Facebook
- X/Twitter

Content topics can include:
- Smart Money Concepts (SMC)
- Risk Management
- Trading Psychology
- Prop Firm Tips
- Forex Education
- Trading Mistakes
- Discipline
- Trading Strategies

Rules:

1. Create EXACTLY ONE post.
2. Give the post a strong hook that stops people from scrolling.
3. Use numbers, mistakes, warnings, or curiosity when appropriate.
4. Give practical and useful information.
5. Tone must be confident, direct and helpful, like an experienced trading mentor.
6. Do not make unrealistic promises about profits.
7. Do not guarantee that a strategy will make money.
8. End with a clear CTA such as "Comment ___" or "DM me ___".
9. Give exactly 3 relevant hashtags.
10. Give one caption.
11. Make the content original and useful.
12. Do NOT create POST 2 or POST 3.
13. Do NOT give multiple variations.
14. Return ONLY ONE complete post.

Use EXACTLY this format:

POST:
TYPE:

HOOK:

BODY:

CTA:

CAPTION:

HASHTAGS:

User request:
`;

app.post('/generate', async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return res.status(400).json({
        error: 'Please enter a topic or idea first.'
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is missing.');

      return res.status(500).json({
        error: 'The AI service is not configured yet. Please add GEMINI_API_KEY in Render Environment Variables.'
      });
    }

    const prompt = AI_PROMPT + topic.trim();

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' +
      encodeURIComponent(process.env.GEMINI_API_KEY),
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
      console.error('Gemini API error:', data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          'Gemini could not generate the post. Please try again.'
      });
    }

    const content =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || '')
        .join('')
        .trim();

    if (!content) {
      console.error('Unexpected Gemini response:', data);

      return res.status(500).json({
        error: 'The AI returned an empty response. Please try again.'
      });
    }

    res.json({
      content: content
    });

  } catch (error) {
    console.error('Server error:', error);

    res.status(500).json({
      error:
        error?.message ||
        'Something went wrong while generating your post.'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TradeContentAI server is running.'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`TradeContentAI server running on port ${PORT}`);
});
