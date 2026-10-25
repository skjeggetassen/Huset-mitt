/* Bildetolking med Claude. Inne i claude.ai brukes din egen Claude-konto (ingen API-nøkkel).
   Åpnet som frittstående fil kan du legge inn en egen API-nøkkel fra console.anthropic.com. */
(function () {
  const { esc } = HM.util;
  const AI = HM.ai = { sample: null, checked: false, limits: null };
  const API_MODEL = 'claude-opus-5-5';

  AI.init = async function () {
    try {
      if (window.claude && window.claude.use) {
        const s = await window.claude.use('sample');
        if (s) { AI.sample = s; try { AI.limits = await s.limits(); } catch (e) { AI.limits = null; } }
      }
    } catch (e) { console.warn('sample', e); }
    AI.checked = true;
    HM.render();
  };
  AI.apiKey = () => { try { return localStorage.getItem('hm-api-key') || ''; } catch (e) { return ''; } };
  AI.setApiKey = k => { try { k ? localStorage.setItem('hm-api-key', k) : localStorage.removeItem('hm-api-key'); } catch (e) {} };
  AI.canImages = () => !!(AI.sample && AI.limits && AI.limits.images) || !!AI.apiKey();
  AI.source = () => (AI.sample && AI.limits && AI.limits.images) ? 'claude' : (AI.apiKey() ? 'api' : null);
  AI.maxImages = () => (AI.source() === 'claude' ? (AI.limits.images.maxCount || 5) : 12);
  AI.statusHtml = function () {
    const src = AI.source();
    if (src === 'claude') return `<div class="notice ok">${HM.icon('sparkle')}<div><strong>Bildetolking er klar.</strong> Claude analyserer bildene med din egen Claude-konto. Første gang blir du spurt om tillatelse.</div></div>`;
    if (src === 'api') return `<div class="notice ok">${HM.icon('sparkle')}<div><strong>Bildetolking er klar</strong> med din egen API-nøkkel (${API_MODEL}). Hver tolking koster typisk under 1–2 kr.</div></div>`;
    if (!AI.checked) return `<div class="notice info">${HM.icon('info')}<div>Sjekker om bildetolking er tilgjengelig …</div></div>`;
    return `<div class="notice warn">${HM.icon('alert')}<div><strong>Bildetolking er ikke tilgjengelig her.</strong> Åpne appen på claude.ai for å bruke Claude med kontoen din, eller legg inn en API-nøkkel under <a href="#" data-act="go" data-to="innstillinger">Innstillinger</a>. Du kan fortsatt tegne rommet selv.</div></div>`;
  };

  /** Gjør bilder klare for analyse: JPEG, maks 1568 px. */
  AI.prepImage = async function (blob) { const r = await HM.downscale(blob, 1568, 0.85); return r.blob; };

  /** PDF → bilder (første sider) med pdf.js */
  AI.pdfToImages = async function (file, maxPages = 3) {
    await HM.loadLib('pdf');
    const lib = window.pdfjsLib; if (!lib) throw new Error('PDF-leseren kunne ikke lastes');
    const buf = await file.arrayBuffer();
    const doc = await lib.getDocument({ data: buf, isEvalSupported: false }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(maxPages, doc.numPages); i++) {
      const page = await doc.getPage(i);
      const vp0 = page.getViewport({ scale: 1 }); const scale = Math.min(3, 2000 / Math.max(vp0.width, vp0.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      out.push(new File([b], `${file.name.replace(/\.pdf$/i, '')} – side ${i}.jpg`, { type: 'image/jpeg' }));
    }
    return out;
  };

  function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); }); }
  function parseJson(text) {
    try { return JSON.parse(text); } catch (e) {}
    const f = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) { try { return JSON.parse(f[1]); } catch (e) {} }
    const s = text.indexOf('{'), e = text.lastIndexOf('}'); if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch (er) {} }
    const err = new Error('Svaret kunne ikke leses som data'); err.code = 'invalid_json'; err.text = text; throw err;
  }

  /** Spør Claude med bilder og få JSON tilbake. */
  AI.askJson = async function (prompt, images = [], { signal, onText, tier = 'default' } = {}) {
    const src = AI.source();
    if (!src) { const e = new Error('Bildetolking er ikke tilgjengelig'); e.code = 'unavailable'; throw e; }
    const prepped = [];
    for (const b of images) prepped.push(await AI.prepImage(b));
    if (src === 'claude') {
      return await AI.sample.json(prompt, { images: prepped, signal, onText, modelTier: tier, cache: false });
    }
    // Egen API-nøkkel (frittstående bruk)
    const content = [];
    for (const b of prepped) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobToB64(b) } });
    content.push({ type: 'text', text: prompt + '\n\nSvar kun med ett JSON-objekt.' });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': AI.apiKey(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      body: JSON.stringify({ model: API_MODEL, max_tokens: 16000, output_config: { effort: 'medium' }, fallbacks: 'default', messages: [{ role: 'user', content }] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error((data.error && data.error.message) || `Feil fra API (${res.status})`); e.code = res.status === 401 ? 'bad_key' : res.status === 429 ? 'rate_limited' : 'api_error'; throw e; }
    if (data.stop_reason === 'refusal') { const e = new Error('Claude avslo forespørselen'); e.code = 'refused'; throw e; }
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    onText && onText({ text, delta: text });
    return parseJson(text);
  };
  AI.errorText = function (e) {
    const c = e && e.code;
    return ({
      not_granted: 'Du har ikke gitt appen lov til å bruke Claude. Last inn siden på nytt for å bli spurt igjen.',
      rate_limited: 'Claude har fått mange forespørsler. Vent et minutt og prøv igjen.',
      cancelled: 'Tolkingen ble stoppet.',
      invalid_json: 'Svaret fra Claude kunne ikke leses. Prøv igjen, gjerne med færre bilder.',
      image_rejected: 'Ett av bildene ble avvist. Prøv et annet format (JPEG eller PNG).',
      images_unavailable: 'Bilder kan ikke sendes til Claude i denne visningen.',
      bad_key: 'API-nøkkelen ble avvist. Sjekk nøkkelen under Innstillinger.',
      refused: 'Claude ville ikke tolke dette materialet.',
      unavailable: 'Bildetolking er ikke tilgjengelig her.',
      session_expired: 'Økten er utløpt. Last inn siden på nytt.',
      prompt_too_large: 'For mye materiale på én gang. Del opp i færre bilder.',
    }[c]) || ('Tolkingen feilet: ' + (e && e.message ? e.message : 'ukjent feil'));
  };

  // ---------- Prompt: hus fra bilder ----------
  AI.housePrompt = function (items, ctx) {
    const list = items.map((it, i) => `Bilde ${i + 1}: type="${it.kind}"${it.room ? `, gjelder rom="${it.room}"` : ''}${it.note ? `, merknad="${it.note}"` : ''} (fil: ${it.name})`).join('\n');
    const existing = ctx.existingRooms.length ? `Rom som allerede finnes i modellen (ikke lag dem på nytt med mindre bildene viser at de er feil): ${ctx.existingRooms.join(', ')}.` : 'Modellen er tom.';
    return `Du hjelper en huseier i Norge med å lage en digital plantegning ut fra eget materiale. Analyser bildene nøyaktig og ærlig.

Materiale:
${list}

${ctx.known ? `Kjent mål oppgitt av brukeren (bruk det til å sette skala): ${ctx.known}` : 'Brukeren har ikke oppgitt noe kjent mål.'}
${ctx.note ? `Brukerens beskrivelse: ${ctx.note}` : ''}
${existing}

Regler:
- Ta bare med rom, vegger, dører og vinduer du faktisk ser eller kan lese i materialet. Ikke finn på rom som ikke vises. Rom som bare så vidt skimtes skal ha "partial": true.
- Skill tydelig mellom mål som står skrevet i materialet ("lest"), mål regnet ut fra et kjent mål eller målestokk ("skalert"), og mål du anslår ut fra synlige ting som dører, fliser eller møbler ("anslatt"). Bruk "ukjent" og null hvis du ikke har grunnlag.
- Et bilde av ett rom viser sjelden hele rommet. Si hva som mangler.
- Ikke vurder om vegger er bærende, og ikke vurder lovlighet eller teknisk tilstand.
- Alle mål i millimeter, innvendige mål (vegg til vegg). Navn og tekster på norsk bokmål.
- Koordinater: bruk ett felles system per etasje, x mot høyre og y nedover slik tegningen vises, origo øverst til venstre. For rom fra plantegning: angi x_mm og y_mm for rommets øvre venstre innvendige hjørne. For rom bare sett på foto: sett x_mm og y_mm til null.
- Åpninger: side er "top", "right", "bottom" eller "left" av rommet slik det vises i tegningen (for foto: din beste vurdering, eller "unknown"). offset_mm er avstand fra rommets venstre hjørne (for top/bottom) eller øvre hjørne (for left/right) til midten av åpningen.
- Lag 2–6 konkrete forespørsler om ekstra bilder eller mål som vil gjøre modellen sikrere. Be helst om ett kjent mål for skala hvis det mangler.

Svar med kun ett JSON-objekt i dette formatet:
{
  "summary": "2–3 setninger om hva materialet viser",
  "floors": [{"name": "1. etasje"}],
  "rooms": [{
    "name": "Stue", "floor": "1. etasje", "type": "stue|kjøkken|soverom|bad|gang|vaskerom|bod|kontor|trapperom|annet",
    "x_mm": 0, "y_mm": 0, "width_mm": 4200, "length_mm": 3600,
    "dimension_source": "lest|skalert|anslatt|ukjent", "confidence": 0.0,
    "ceiling_height_mm": null, "ceiling_source": "lest|skalert|anslatt|ukjent",
    "partial": false, "from_images": [1], "evidence": "kort begrunnelse for målene",
    "floor_finish": "eik|ask|valnott|gran|flis_gra|flis_lys|flis_mork|vinyl|teppe|betong|skifer|null", "wall_color_hex": "#F2F0EA eller null"
  }],
  "openings": [{"room": "Stue", "side": "top|right|bottom|left|unknown", "type": "door|window|opening", "offset_mm": 900, "width_mm": 900, "height_mm": 2100, "sill_mm": 0, "source": "lest|skalert|anslatt|ukjent", "leads_to": "Gang|ute|ukjent"}],
  "connections": [{"from": "Stue", "to": "Gang", "via": "door|opening"}],
  "observations": ["ting du ser, f.eks. materialer, takhøyde, trapp"],
  "uncertain": ["det du er usikker på"],
  "requests": [{"what": "Ta et bilde av ...", "why": "for å ..."}]
}`;
  };

  // ---------- Prompt: kvittering ----------
  AI.receiptPrompt = function (projects, cats) {
    return `Les denne kvitteringen eller fakturaen fra en norsk butikk eller håndverker. Les bare det som faktisk står. Gjett ikke tall du ikke kan lese.

Prosjekter brukeren har (velg det mest sannsynlige, eller null): ${JSON.stringify(projects)}
Kategorier: ${cats.join(', ')}

Svar med kun ett JSON-objekt:
{
  "store": "butikknavn eller null",
  "date": "YYYY-MM-DD eller null",
  "total": 0.00,
  "currency": "NOK",
  "vat": null,
  "is_return": false,
  "lines": [{"text": "varenavn", "qty": 1, "amount": 0.00}],
  "category": "en av kategoriene",
  "project_id": "id eller null",
  "uncertain_fields": ["store","date","total","lines","category","project_id"],
  "notes": "kort merknad, f.eks. hvis deler av kvitteringen er uleselig"
}
Regler: total er beløpet som faktisk ble betalt (inkl. mva). Returer og refusjoner har is_return true og positivt beløp. Ta med varelinjer bare hvis de er lesbare. Legg et felt i uncertain_fields hvis du ikke er sikker på det.`;
  };
})();
