export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { imageBase64, imageType, organ, service } = req.body || {};
  if (!imageBase64) { res.status(400).json({ error: 'No image provided' }); return; }

  if (service === 'plantnet') {
    try {
      const PLANTNET_KEY = '2b10yJM6CuBvi9Sac1t84q0gk';
      const byteChars = atob(imageBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: imageType || 'image/jpeg' });
      const formData = new FormData();
      formData.append('images', blob, 'tree.jpg');
      formData.append('organs', organ || 'leaf');
      const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${PLANTNET_KEY}&nb-results=5&lang=en`;
      const response = await fetch(url, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`PlantNet ${response.status}`);
      const data = await response.json();
      res.status(200).json({ success: true, source: 'plantnet', data });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
    return;
  }

  if (service === 'gemini') {
    try {
      const GEMINI_KEY = 'AIzaSyDttmwgCRGUGMU43HjZIX8cjxObhxTdSfM';
      const prompt = `You are an expert botanist specialising in Indian trees found in Delhi. Look at this photo and identify the tree species. Respond with ONLY valid JSON no markdown: {"common_name":"English name","hindi_name":"Hindi in Devanagari","scientific_name":"Genus species","family":"Plant family","confidence":85,"in_delhi":true,"identification_notes":"2-3 sentences on key visual features that helped identify it","alternatives":[{"common":"Alt 1","sci":"Scientific name","confidence":30},{"common":"Alt 2","sci":"Scientific name","confidence":15}]}`;
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
            generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
          })
        }
      );
      if (!response.ok) { const e = await response.text(); throw new Error(`Gemini ${response.status}: ${e}`); }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      res.status(200).json({ success: true, source: 'gemini', data: parsed });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
    return;
  }

  res.status(400).json({ error: 'Unknown service' });
}
