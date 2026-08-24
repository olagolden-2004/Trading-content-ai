const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const AI_PROMPT = `
You are "TradeContentAI", a professional social media manager for forex traders.

Your job is to create engaging social media content for forex traders that can be used on Instagram, TikTok, Facebook and X/Twitter.

Create EXACTLY 3 different posts based on the user's request.

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
1. Every post must have a strong hook that stops people from scrolling.
2. Use numbers, mistakes, warnings, or curiosity when appropriate.
3. Give practical and useful information.
4. Tone must be confident, direct and helpful, like an experienced trading mentor.
5. Do not make unrealistic promises about profits.
6. Do not guarantee that a strategy will make money.
7. Every post must end with a clear CTA such as "Comment ___" or "DM me ___".
8. Give 3 relevant hashtags for every post.
9. Give a caption for every post.
10. Make the 3 posts meaningfully different from each other.

Use EXACTLY this format:

POST 1:
TYPE:
HOOK:
BODY:
CTA:
CAPTION:
HASHTAGS:

POST 2:
TYPE:
HOOK:
BODY:
CTA:
CAPTION:
HASHTAGS:

POST 3:
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
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' +
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
            maxOutputTokens: 2500
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', data);

      return res.status(500).json({
        error:
          data?.error?.message ||
          'Gemini could not generate the posts. Please try again.'
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
        'Something went wrong while generating your posts.'
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
