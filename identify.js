export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { imageBase64, imageType, organ, service } = req.body || {};
  if (!imageBase64) { res.status(400).json({ error: 'No image provided' }); return; }

  // ── PLANTNET ──────────────────────────────────────────────
  if (service === 'plantnet') {
    try {
      const PLANTNET_KEY = process.env.PLANTNET_API_KEY || '2b10yJM6CuBvi9Sac1t84q0gk';
      const byteChars = atob(imageBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: imageType || 'image/jpeg' });
      const formData = new FormData();
      formData.append('images', blob, 'tree.jpg');
      formData.append('organs', organ || 'leaf');
      const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${PLANTNET_KEY}&nb-results=5&lang=en`;
      const response = await fetch(url, { method: 'POST', body: formData });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`PlantNet ${response.status}: ${errText}`);
      }
      const data = await response.json();
      res.status(200).json({ success: true, source: 'plantnet', data });
    } catch (e) {
      console.error('PlantNet error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
    return;
  }

  // ── CLAUDE ────────────────────────────────────────────────
  if (service === 'claude') {
    try {
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) {
        res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not set in Vercel environment variables' });
        return;
      }
      const prompt = `You are an expert botanist specialising in Indian trees in Delhi, especially Jor Bagh neighbourhood. The user photographed the ${organ||'plant'} of a tree. Identify it. Respond ONLY with valid JSON (no markdown, no extra text): {"common_name":"English name","hindi_name":"Hindi name with Devanagari","scientific_name":"Genus species","family":"Plant family","confidence":85,"in_jor_bagh":true,"identification_notes":"2-3 sentences on key identifying features","alternatives":[{"common":"Alt 1","sci":"Scientific name","confidence":40},{"common":"Alt 2","sci":"Scientific name","confidence":20}]}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: imageType || 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      });
      if (!response.ok) throw new Error(`Claude ${response.status}`);
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      res.status(200).json({ success: true, source: 'claude', data: parsed });
    } catch (e) {
      console.error('Claude error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
    return;
  }

  res.status(400).json({ error: 'Unknown service. Use plantnet or claude.' });
}
