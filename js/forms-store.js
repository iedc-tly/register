/**
 * ==========================================================================
 *  IEDC FORMS - CENTRAL DATA STORE & GOOGLE SHEETS DISPATCHER
 * ==========================================================================
 */

const FormsStore = (function () {
  'use strict';

  const FORMS_KEY = 'iedc_forms_db';
  const SUBMISSIONS_KEY = 'iedc_submissions_db';
  const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwoz1ixKx1vD53R4imzimA48EuZZgCiMOUO2Vz1m8ABtpvh3Fm6MkZ_ilQiXFstzLYd/exec';

  // Prebuilt Question Templates Catalog (Google Forms / Zoho Forms style)
  const PREBUILT_TEMPLATES = [
    {
      id: "full_name",
      title: "Full Name",
      type: "text",
      placeholder: "e.g., Savanth S Joy",
      required: true,
      category: "Contact"
    },
    {
      id: "email",
      title: "Email Address",
      type: "email",
      placeholder: "e.g., savanth@gmail.com",
      required: true,
      helpText: "Your registration pass will be delivered to this email",
      category: "Contact"
    },
    {
      id: "phone",
      title: "Phone / WhatsApp Number",
      type: "tel",
      placeholder: "e.g., 9876543210",
      required: true,
      category: "Contact"
    },
    {
      id: "college",
      title: "College / University Name",
      type: "text",
      placeholder: "e.g. College of Engineering Thalassery",
      required: true,
      category: "Academic"
    },
    {
      id: "department",
      title: "Department / Branch",
      type: "dropdown",
      options: [
        "Computer Science & Engineering",
        "Information Technology",
        "AI & Data Science",
        "Electronics & Communication (ECE)",
        "Electrical & Electronics (EEE)",
        "Mechanical Engineering",
        "Civil Engineering",
        "Management / MBA",
        "Other"
      ],
      required: true,
      category: "Academic"
    },
    {
      id: "year_of_study",
      title: "Year of Study",
      type: "single_select", // Radio
      options: ["S1","S2", "S3", "S4", "S5", "S6", "S7", "S8"],
      required: true,
      category: "Academic"
    },
    {
      id: "student_id",
      title: "Roll Number / Student ID",
      type: "text",
      placeholder: "e.g., 42",
      required: false,
      category: "Academic"
    },
    {
      id: "team_size",
      title: "Team Size",
      type: "number", // Numbers only
      placeholder: "Enter a number (1 - 5)",
      required: false,
      category: "Logistics"
    },
    {
      id: "tshirt_size",
      title: "T-Shirt Size (for free swag)",
      type: "single_select",
      options: ["S", "M", "L", "XL", "XXL"],
      required: true,
      category: "Logistics"
    },
    {
      id: "food_pref",
      title: "Food & Refreshment Preference",
      type: "single_select",
      options: ["Vegetarian", "Non-Vegetarian", "Jain Food"],
      required: true,
      category: "Logistics"
    },
    {
      id: "skills_tracks",
      title: "Areas of Interest / Track Preferences",
      type: "multiple_select", // Checkboxes
      options: ["Web & Mobile Dev", "AI & Machine Learning", "Blockchain / Web3", "UI/UX Design", "Startup & Pitching"],
      required: false,
      category: "Logistics"
    },
    {
      id: "github_linkedin",
      title: "LinkedIn or GitHub Profile",
      type: "text",
      placeholder: "https://linkedin.com/in/... or github.com/...",
      required: false,
      category: "Profiles"
    },
    {
      id: "payment_screenshot",
      title: "Upload Payment Screenshot (UPI / Bank Proof)",
      type: "file_upload",
      required: true,
      helpText: "Upload a screenshot of your successful UPI payment showing the UTR / Ref No.",
      category: "Payment"
    },
    {
      id: "student_id_proof",
      title: "Student ID Card Photo",
      type: "file_upload",
      required: false,
      helpText: "Upload a photo of your College ID card for entry verification",
      category: "Academic"
    }
  ];

  // Default Questions for Attendance Forms (Name, Semester, Department, Roll No, Hours)
  const ATTENDANCE_DEFAULT_QUESTIONS = [
    {
      id: "att_name",
      title: "Full Name",
      type: "text",
      placeholder: "Enter attendee's full name",
      required: true,
      category: "Contact"
    },
    {
      id: "att_semester",
      title: "Semester",
      type: "dropdown",
      options: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
      required: true,
      category: "Academic"
    },
    {
      id: "att_department",
      title: "Department / Branch",
      type: "dropdown",
      options: ['CS1','CS2','EC1','IT','EC2','EEE','CE','ME','ECS','MBA','other'],
      required: true,
      category: "Academic"
    },
    {
      id: "att_roll",
      title: "Roll Number / Student ID",
      type: "text",
      placeholder: "e.g., 42",
      required: true,
      category: "Academic"
    },
    {
      id: "att_hours",
      title: "Hours",
      type: "text",
      placeholder: "e.g., 2 Hours",
      defaultValue: "2 Hours",
      readonly: true,
      helpText: "Pre-filled by organizer (Verified Session Duration)",
      required: true,
      category: "Attendance"
    }
  ];

  // Default initial forms (Clean & Empty for fresh setup)
  const INITIAL_FORMS = [];

  /**
   * Initialize or retrieve forms database
   */
  function getForms() {
    try {
      const stored = localStorage.getItem(FORMS_KEY);
      if (stored !== null) {
        let parsed = JSON.parse(stored);
        let updated = false;

        // Automatically purge obsolete demo test forms
        const cleaned = parsed.filter(f => f && f.id && f.id !== 'hacknova-2026' && f.id !== 'startup-summit-2026');
        if (cleaned.length !== parsed.length) {
          parsed = cleaned;
          updated = true;
        }

        parsed.forEach(f => {
          if (!f.sheetWebhookUrl || f.sheetWebhookUrl !== DEFAULT_WEBHOOK_URL) {
            f.sheetWebhookUrl = DEFAULT_WEBHOOK_URL;
            updated = true;
          }
        });
        if (updated) localStorage.setItem(FORMS_KEY, JSON.stringify(parsed));
        return parsed;
      }
    } catch (e) {
      console.warn("Error reading forms from localStorage:", e);
    }
    return [];
  }

  function getFormById(id) {
    if (!id) return null;
    const cleanId = String(id).toLowerCase().trim();
    const forms = getForms();

    // 1. Direct match on id
    let match = forms.find(f => f.id && f.id.toLowerCase() === cleanId);
    if (match) return match;

    // 2. Match on aliases array
    match = forms.find(f => Array.isArray(f.aliases) && f.aliases.some(a => String(a).toLowerCase() === cleanId));
    if (match) return match;

    // 3. Clean Short Link Slug mapping: e126 (or e1, e1-2026) maps to Event 1 of 2026
    if (cleanId === 'e126' || cleanId === 'e1' || cleanId === 'e1-2026') {
      return forms.find(f => f.id === 'interactive-session') ||
             forms.find(f => f.id === 'hacknova-2026') ||
             forms[0] || null;
    }

    return null;
  }

  const AVAILABLE_BANNER_ASSETS = [
    {
      id: "anoop-1",
      title: "Keynote Session (Anoop Ambika - 1)",
      url: "assets/images/AnoopAmbika (1).jpeg"
    },
    {
      id: "anoop-2",
      title: "Leadership Conclave (Anoop Ambika - 2)",
      url: "assets/images/AnoopAmbika (2).jpeg"
    }
  ];

  const DEFAULT_BANNER_URL = 'assets/images/AnoopAmbika (1).jpeg';

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || (`event-${Date.now().toString(36)}`);
  }

  async function saveForm(form, skipCloudSync = false) {
    if (!form.formType) form.formType = 'registration';
    if (form.formType === 'attendance') {
      if (!form.category) form.category = 'Session Attendance';
      form.pricingType = 'free';
      form.fee = 'Attendance Form';
    } else {
      if (!form.category) form.category = 'Campus Event';
      if (!form.pricingType) form.pricingType = 'free';
      if (!form.fee) form.fee = form.pricingType === 'paid' ? '₹99' : '₹0 (Free Entry)';
    }
    if (form.paymentQr === undefined) form.paymentQr = '';
    if (form.paymentInstructions === undefined) form.paymentInstructions = '';
    // Always ensure the form uses the latest active webhook URL
    if (!form.sheetWebhookUrl || form.sheetWebhookUrl.includes('AKfycbzVuHuWV2')) {
      form.sheetWebhookUrl = DEFAULT_WEBHOOK_URL;
    }

    const forms = getForms();
    const idx = forms.findIndex(f => f.id === form.id);
    if (idx >= 0) {
      forms[idx] = form;
    } else {
      forms.unshift(form);
    }
    localStorage.setItem(FORMS_KEY, JSON.stringify(forms));

    // Automatically sync form to connected Google Sheet
    if (!skipCloudSync) {
      await syncFormToCloud(form);
    }
    return form;
  }

  async function deleteForm(id) {
    let forms = getForms();
    forms = forms.filter(f => f.id !== id);
    localStorage.setItem(FORMS_KEY, JSON.stringify(forms));
    await deleteFormFromCloud(id);
    return forms;
  }

  /**
   * Ultra-Compact Cross-Device URL Encoding & Decoding
   * Drastically cuts down link length (60%+ smaller) by stripping redundant defaults
   * and mapping questions into lightweight tuples.
   */
  function encodeFormToUrl(form) {
    if (!form) return '';
    try {
      const compact = {
        t: form.title || ''
      };
      if (form.formType && form.formType !== 'registration') compact.ft = form.formType;
      if (form.description) compact.ds = form.description;
      if (form.category && form.category !== 'Campus Event') compact.c = form.category;
      if (form.pricingType && form.pricingType !== 'free') compact.pt = form.pricingType;
      if (form.fee && form.fee !== '₹0 (Free Entry)') compact.f = form.fee;
      if (form.paymentQr) compact.qr = form.paymentQr;
      if (form.paymentInstructions) compact.pi = form.paymentInstructions;
      if (form.venue && form.venue !== 'Campus Venue') compact.v = form.venue;
      if (form.dateStr && form.dateStr !== 'Date TBD') compact.d = form.dateStr;
      if (form.timeStr && form.timeStr !== '09:00 AM') compact.tm = form.timeStr;
      if (form.bannerUrl && form.bannerUrl !== DEFAULT_BANNER_URL) compact.b = form.bannerUrl;
      if (form.sheetWebhookUrl && form.sheetWebhookUrl !== DEFAULT_WEBHOOK_URL) compact.w = form.sheetWebhookUrl;

      if (Array.isArray(form.questions) && form.questions.length > 0) {
        compact.q = form.questions.map(q => {
          const type = q.type || 'text';
          const isChoice = ['single_select', 'multiple_select', 'dropdown'].includes(type);
          const item = [q.title || 'Question'];
          if (type !== 'text' || q.required || (isChoice && q.options && q.options.length) || q.helpText || q.defaultValue || q.readonly) {
            item.push(type === 'text' ? '' : type);
          }
          if (q.required || (isChoice && q.options && q.options.length) || q.helpText || q.defaultValue || q.readonly) {
            item.push(q.required ? 1 : 0);
          }
          if (isChoice && Array.isArray(q.options) && q.options.length > 0) {
            item.push(q.options);
          } else if (q.helpText || q.defaultValue || q.readonly) {
            item.push(q.helpText || '');
          }
          if (q.defaultValue !== undefined || q.readonly) {
            item.push(q.defaultValue || '');
            item.push(q.readonly ? 1 : 0);
          }
          return item;
        });
      }

      const jsonStr = JSON.stringify(compact);
      const utf8Bytes = new TextEncoder().encode(jsonStr);
      let binary = '';
      for (let i = 0; i < utf8Bytes.byteLength; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      const b64 = btoa(binary);
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
      console.error("Error encoding form to URL:", e);
      return '';
    }
  }

  function decodeFormFromUrl(encodedStr, fallbackId) {
    if (!encodedStr) return null;
    try {
      let clean = decodeURIComponent(encodedStr.trim()).replace(/-/g, '+').replace(/_/g, '/');
      while (clean.length % 4) {
        clean += '=';
      }
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const jsonStr = new TextDecoder().decode(bytes);
      const data = JSON.parse(jsonStr);

      // Support new compact schema
      if (data.t && !data.title) {
        return {
          id: fallbackId || data.i || (`form-${Date.now()}`),
          formType: data.ft || 'registration',
          title: data.t,
          description: data.ds || '',
          category: data.c || (data.ft === 'attendance' ? 'Session Attendance' : 'Campus Event'),
          pricingType: data.pt || 'free',
          fee: data.f || (data.pt === 'paid' ? '₹99' : (data.ft === 'attendance' ? 'Attendance Form' : '₹0 (Free Entry)')),
          paymentQr: data.qr || '',
          paymentInstructions: data.pi || '',
          venue: data.v || 'Campus Venue',
          dateStr: data.d || 'Date TBD',
          timeStr: data.tm || '09:00 AM',
          bannerUrl: data.b || DEFAULT_BANNER_URL,
          sheetWebhookUrl: data.w || DEFAULT_WEBHOOK_URL,
          questions: (data.q || []).map((item, idx) => {
            if (Array.isArray(item)) {
              return {
                id: `q_${idx}`,
                title: item[0],
                type: item[1] || 'text',
                required: Boolean(item[2]),
                options: Array.isArray(item[3]) ? item[3] : [],
                helpText: typeof item[3] === 'string' ? item[3] : '',
                defaultValue: typeof item[4] === 'string' ? item[4] : '',
                readonly: Boolean(item[5])
              };
            }
            return item;
          })
        };
      }

      // Support legacy schema
      if (data && data.title) {
        if (!data.formType) data.formType = 'registration';
        if (!data.category) data.category = data.formType === 'attendance' ? 'Session Attendance' : 'Campus Event';
        if (!data.pricingType) data.pricingType = 'free';
        if (!data.fee) data.fee = data.formType === 'attendance' ? 'Attendance Form' : '₹0 (Free Entry)';
        if (!data.sheetWebhookUrl) data.sheetWebhookUrl = DEFAULT_WEBHOOK_URL;
        if (!data.bannerUrl) data.bannerUrl = DEFAULT_BANNER_URL;
        return data;
      }
    } catch (e) {
      console.warn("Error decoding form from URL data:", e);
    }
    return null;
  }

  function getBaseUrl() {
    try {
      let href = window.location.href.split('?')[0].split('#')[0];
      if (href.endsWith('.html')) {
        return href.replace(/[^/]+\.html$/, '');
      } else if (href.endsWith('/')) {
        return href;
      } else {
        return href + '/';
      }
    } catch (e) {
      return '';
    }
  }

  /**
   * Short Link: Clean Slug URL (e.g. https://iedc-tly.github.io/register/e126)
   * Resolves instantly across devices when synced with Google Sheets or cached locally.
   */
  function getShortUrl(formOrId) {
    const id = typeof formOrId === 'string' ? formOrId : (formOrId && formOrId.id);
    if (!id) return '';
    const base = getBaseUrl();
    if (base.indexOf('file://') === 0) {
      return `${base}index.html?form=${encodeURIComponent(id)}`;
    }
    return `${base}${encodeURIComponent(id)}`;
  }

  /**
   * Universal Link: Self-contained URL (?form=new-event&d=...)
   * Guarantees 100% offline & cross-device compatibility.
   */
  function getShareableUrl(formOrId) {
    const form = typeof formOrId === 'string' ? getFormById(formOrId) : formOrId;
    if (!form) {
      if (typeof formOrId === 'string' && formOrId) {
        return `${getBaseUrl()}?form=${encodeURIComponent(formOrId)}`;
      }
      return '';
    }

    const base = getBaseUrl();
    const encoded = encodeFormToUrl(form);
    if (encoded) {
      return `${base}?form=${encodeURIComponent(form.id)}&d=${encoded}`;
    }
    return `${base}?form=${encodeURIComponent(form.id)}`;
  }

  /**
   * Google Apps Script Cloud Sync
   */
  async function syncFormToCloud(form, webhookUrl) {
    const url = webhookUrl || form.sheetWebhookUrl || localStorage.getItem('iedc_global_webhook_url') || DEFAULT_WEBHOOK_URL;
    if (!url || !url.startsWith('http')) return false;
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'save_form_config',
          form: form
        })
      });
      return true;
    } catch (e) {
      console.warn("Cloud form sync notice:", e);
      return false;
    }
  }

  async function fetchFormFromCloud(formId, webhookUrl) {
    const url = webhookUrl || localStorage.getItem('iedc_global_webhook_url') || DEFAULT_WEBHOOK_URL;
    if (!url || !url.startsWith('http')) return null;

    async function queryGas(idToTry) {
      try {
        const fetchUrl = `${url}?action=get_form&id=${encodeURIComponent(idToTry)}`;
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const text = await res.text();
          let data = null;
          try {
            data = JSON.parse(text);
            if (typeof data === 'string') data = JSON.parse(data);
          } catch (jsonErr) {}
          if (data && data.title && !data.error) return data;
        }
      } catch (err) {}
      return null;
    }

    try {
      let data = await queryGas(formId);
      if (data) return data;

      // Check alternate aliases (e126 <-> interactive-session)
      const clean = String(formId).toLowerCase().trim();
      const alt = (clean === 'e126' || clean === 'e1') ? 'interactive-session' : (clean === 'interactive-session' ? 'e126' : null);
      if (alt) {
        data = await queryGas(alt);
        if (data) return data;
      }
    } catch (e) {
      console.warn("Cloud form fetch notice:", e);
    }
    return null;
  }

  async function deleteFormFromCloud(formId, webhookUrl) {
    const url = webhookUrl || localStorage.getItem('iedc_global_webhook_url') || DEFAULT_WEBHOOK_URL;
    if (!url || !url.startsWith('http') || !formId) return false;
    try {
      await fetch(`${url}?action=delete_form&id=${encodeURIComponent(formId)}&_t=${Date.now()}`);
      return true;
    } catch (e) {
      try {
        await fetch(`${url}?action=delete_form&id=${encodeURIComponent(formId)}`, { mode: 'no-cors' });
        return true;
      } catch (err2) {
        console.warn("Cloud delete notice:", err2);
        return false;
      }
    }
  }

  async function fetchAllFormsFromCloud(webhookUrl) {
    const url = webhookUrl || localStorage.getItem('iedc_global_webhook_url') || DEFAULT_WEBHOOK_URL;
    if (!url || !url.startsWith('http')) return null;

    try {
      const fetchUrl = `${url}?action=get_all_forms&_t=${Date.now()}`;
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
          if (typeof data === 'string') data = JSON.parse(data);
        } catch (jsonErr) {}

        if (data && Array.isArray(data.forms)) {
          // Filter out obsolete test demo forms
          const validForms = data.forms.filter(f => f && f.id && f.title && f.id !== 'hacknova-2026' && f.id !== 'startup-summit-2026');
          if (validForms.length > 0) {
            localStorage.setItem(FORMS_KEY, JSON.stringify(validForms));
            return validForms;
          } else {
            // Cloud has 0 forms. Check if local has newly saved forms:
            const local = getForms();
            if (local.length > 0) {
              // Push local forms up to the cloud!
              for (const f of local) {
                await syncFormToCloud(f, url);
              }
              return local;
            }
            localStorage.setItem(FORMS_KEY, JSON.stringify([]));
            return [];
          }
        }
      }
    } catch (err) {
      console.warn("Could not fetch all forms from cloud:", err);
    }
    return null;
  }


  /**
   * Submissions Management
   */
  function getSubmissions(formId = null) {
    try {
      const list = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY) || '[]');
      if (formId) {
        return list.filter(item => item['Form ID'] === formId);
      }
      return list;
    } catch (e) {
      return [];
    }
  }

  async function recordSubmission(form, answers) {
    const isAttendance = Boolean(form && form.formType === 'attendance');
    const idPrefix = isAttendance ? 'ATT' : 'IEDC';
    const bookingId = `${idPrefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const timestamp = new Date().toLocaleString();

    // 1. Complete local record for offline backup & admin dashboard
    const record = {
      "Timestamp": timestamp,
      "Booking ID": bookingId,
      "Attendance ID": bookingId,
      "Form ID": form.id,
      "Form Type": form.formType || 'registration',
      "Event Title": form.title,
      ...answers
    };

    try {
      const list = getSubmissions();
      list.unshift(record);
      localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(list));
    } catch (e) {
      console.error("Local storage error:", e);
    }

    // 2. Prepare payload for Google Sheets:
    // Contains Timestamp, Booking ID, Attendance ID, and the exact question titles created in this form!
    const sheetPayload = {
      "_eventTitle": form.title, // Internal routing parameter for tab naming (not added as a column)
      "Timestamp": timestamp,
      "Booking ID": bookingId,
      "Attendance ID": bookingId
    };

    // Add questions in the exact order created in the form
    if (Array.isArray(form.questions)) {
      form.questions.forEach(q => {
        if (q && q.title) {
          sheetPayload[q.title] = answers[q.title] !== undefined ? answers[q.title] : "";
        }
      });
    }

    // Add any additional form fields if not already captured
    for (const key of Object.keys(answers)) {
      if (sheetPayload[key] === undefined) {
        sheetPayload[key] = answers[key];
      }
    }

    // 3. Dispatch to Google Apps Script Webhook asynchronously (Non-blocking for instant attendee confirmation)
    const webhookUrl = form.sheetWebhookUrl || localStorage.getItem('iedc_global_webhook_url') || DEFAULT_WEBHOOK_URL;
    let syncPromise = null;
    if (webhookUrl && webhookUrl.startsWith('http')) {
      syncPromise = fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors', // Standard bypass for Google Apps Script Web App
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(sheetPayload)
      }).catch(err => {
        console.warn("Google Sheet webhook POST notice:", err);
        return false;
      });
    }

    // Attach promise to record for real-time status reflection if needed
    record._syncPromise = syncPromise;

    return record;
  }

  function clearSubmissions() {
    localStorage.removeItem(SUBMISSIONS_KEY);
  }

  return {
    getForms,
    getFormById,
    saveForm,
    deleteForm,
    getSubmissions,
    recordSubmission,
    clearSubmissions,
    encodeFormToUrl,
    decodeFormFromUrl,
    getShareableUrl,
    getShortUrl,
    syncFormToCloud,
    fetchFormFromCloud,
    fetchAllFormsFromCloud,
    deleteFormFromCloud,
    slugify,
    AVAILABLE_BANNER_ASSETS,
    DEFAULT_BANNER_URL,
    DEFAULT_WEBHOOK_URL,
    PREBUILT_TEMPLATES,
    ATTENDANCE_DEFAULT_QUESTIONS
  };
})();

if (typeof window !== 'undefined') {
  window.FormsStore = FormsStore;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormsStore;
}
