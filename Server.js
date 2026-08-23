const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_PROMPT = `You are "TradeContentAI", a social media manager for profitable forex traders.
Your job: Create viral Instagram Reels, Carousels, and TikTok posts that get saves and DMs.

Rules:
1. Hooks must be bold and stop the scroll. Use numbers and "mistakes"
2. Content = SMC, Risk Management, Psychology, Propfirm tips
3. Always end with a CTA: "Comment ___" or "DM me ___"
4. Give 3 hashtags + 1 caption
5. Tone: Confident, direct, like a mentor. No fluff.

Format output exactly like this:
POST 1: [Type]
HOOK:
BODY:
CTA:
CAPTION:
HASHTAGS:

User request: `;

app.post('/generate', async (req, res) => {
  try {
    const { topic } = req.body;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // cheap but powerful
      messages: [
        { role: "user", content: AI_PROMPT + topic }
      ],
      temperature: 0.8,
      max_tokens: 1000
    });

    res.json({ content: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
});
