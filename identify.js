export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { imageBase64, imageType, organ, service } = req.body || {};
  if (!imageBase64) { res.status(400).json({ error: 'No image provided' }); return; }

  if (service === 'gemini') {
    try {
      const GEMINI_KEY = 'AIzaSyDttmwgCRGUGMU43HjZIX8cjxObhxTdSfM';
      const prompt = `You are an expert botanist for Indian trees and plants found in Delhi. Look at this photo carefully and identify the species. Respond ONLY with valid JSON no markdown no extra text: {"common_name":"English name","hindi_name":"Hindi in Devanagari","scientific_name":"Genus species","family":"Plant family","confidence":85,"in_delhi":true,"identification_notes":"2-3 sentences on the key visual features that helped identify it","alternatives":[{"common":"Second option","sci":"Scientific name","confidence":25},{"common":"Third option","sci":"Scientific name","confidence":10}]}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: imageType || 'image/jpeg', data: imageBase64 } },
              { text: prompt }
            ]}],
            generationConfig: { temperature: 0.1, maxOutputTokens: 600 }
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('Gemini API error:', response.status, errText);
        throw new Error(`Gemini ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      res.status(200).json({ success: true, source: 'gemini', data: parsed });

    } catch (e) {
      console.error('Gemini error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
    return;
  }

  if (service === 'plantnet') {
    try {
      const PLANTNET_KEY = '2b10yJM6CuBvi9Sac1t84q0gk';
      const buffer = Buffer.from(imageBase64, 'base64');
      const { Blob } = await import('buffer');
      const blob = new Blob([buffer], { type: imageType || 'image/jpeg' });

      const { FormData } = await import('undici');
      const formData = new FormData();
      formData.append('images', blob, 'tree.jpg');
      formData.append('organs', organ || 'leaf');

      const response = await fetch(
        `https://my-api.plantnet.org/v2/identify/all?api-key=${PLANTNET_KEY}&nb-results=5&lang=en`,
        { method: 'POST', body: formData }
      );

      if (!response.ok) throw new Error(`PlantNet ${response.status}`);
      const data = await response.json();
      res.status(200).json({ success: true, source: 'plantnet', data });

    } catch (e) {
      console.error('PlantNet error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
    return;
  }

  res.status(400).json({ error: 'Unknown service. Use gemini or plantnet.' });
}
