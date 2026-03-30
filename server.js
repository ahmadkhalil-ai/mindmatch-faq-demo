const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serves your frontend

const FAQ_DATA = [
  { id:1, q:"How do I find the right therapist?", a:"Use our filters to narrow by specialty, therapy style, and language. We recommend watching intro videos before booking a free 15-minute consultation.", cat:"Getting started" },
  { id:2, q:"How much does therapy cost?", a:"Sessions range $60–$180 depending on the therapist. We support sliding-scale pricing and most major insurance plans.", cat:"Pricing" },
  { id:3, q:"Is my data private?", a:"Yes. All session data is encrypted end-to-end. We comply with HIPAA and never share your information with third parties.", cat:"Privacy" },
  { id:4, q:"What therapy types are available?", a:"CBT, DBT, EMDR, psychodynamic, ACT and more. Filter by modality in search.", cat:"Therapy types" },
  { id:5, q:"Can I do therapy online?", a:"Yes. Online sessions run through our encrypted video platform — no third-party apps needed.", cat:"Sessions" },
  { id:6, q:"How do I cancel an appointment?", a:"Cancel or reschedule up to 24 hours before your session at no charge via your dashboard.", cat:"Appointments" },
  { id:7, q:"What if I don't connect with my therapist?", a:"Switch at any time — Settings → My therapist → Request change. We'll help you find a better match at no cost.", cat:"Getting started" },
  { id:8, q:"Does MindMatch accept insurance?", a:"We accept Blue Cross, Aetna, Cigna, United Health, and others. Enter your insurance details during signup.", cat:"Pricing" },
  { id:9, q:"How long is a session?", a:"Standard sessions are 50 minutes. Some therapists offer 80-minute extended sessions.", cat:"Sessions" },
  { id:10, q:"Is MindMatch suitable for children?", a:"Yes. We have therapists specializing in child therapy (ages 6–17). Parental consent is required for minors.", cat:"Getting started" },
];

// Simple keyword similarity (production would use real embeddings)
function getSimilarity(query, faqQ, faqA) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9 ]/g,'').split(' ').filter(w=>w.length>2);
  const qWords = new Set(normalize(query));
  const docWords = normalize(faqQ + ' ' + faqA);
  let matches = 0;
  docWords.forEach(w => { if(qWords.has(w)) matches++; });
  return Math.min(0.55 + (matches / Math.max(qWords.size, 1)) * 1.8, 0.99);
}

app.post('/api/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'No question provided' });

  // 1. Retrieve top 3 matching FAQs
  const ranked = FAQ_DATA
    .map(f => ({ ...f, score: getSimilarity(question, f.q, f.a) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 3);

  // 2. Build context for Claude
  const context = ranked.map((f,i) => `[${i+1}] Q: ${f.q}\nA: ${f.a}`).join('\n\n');

  // 3. Call Claude API
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `You are a helpful assistant for MindMatch, a therapist search platform. Answer using ONLY this FAQ context. Be warm and concise. If context doesn't cover the question, say you're not sure and suggest contacting support.\n\nFAQ Context:\n${context}`,
        messages: [{ role: 'user', content: question }]
      })
    });

    const data = await response.json();
    const answer = data.content?.[0]?.text || "I'm not sure about that. Please contact our support team.";

    // 4. Log query
    console.log(`[QUERY] "${question}" → top match: "${ranked[0].q}" (${Math.round(ranked[0].score*100)}%)`);

    res.json({
      answer,
      sources: ranked.filter(r => r.score > 0.62).map(r => ({ cat: r.cat, score: r.score }))
    });
  } catch (err) {
    res.status(500).json({ error: 'API error', details: err.message });
  }
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));