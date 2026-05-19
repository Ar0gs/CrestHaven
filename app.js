/**
 * CRESTHAVEN HOMES LTD — MAIN APPLICATION SCRIPT
 * Backend: Supabase (PostgreSQL + Auth + Realtime)
 * Features: Auth, Properties, Listings, Enquiries, Live Chat, Testimonials
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SETUP INSTRUCTIONS                                              ║
 * ║  1. Create a Supabase project at https://supabase.com           ║
 * ║  2. Replace SUPABASE_URL and SUPABASE_ANON_KEY below            ║
 * ║  3. Run the SQL schema (schema.sql) in your Supabase SQL editor  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = 'https://igzvhsngkvkfngcxfbmi.supabase.co';        // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnenZoc25na3ZrZm5nY3hmYm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMTkwMTYsImV4cCI6MjA5NDc5NTAxNn0.wRqBjiDaRqGx2agRYpwN93lNMfd-3ysmOp8P_H7OtYs';      // From Settings > API

let supabase = null;
let currentUser = null;
let propOffset = 0;
const PROP_LIMIT = 6;
let activeFilter = 'all';
let chatOpen = false;
let chatMessages = [];
let currentSessionId = null;

// Initialize Supabase
function initSupabase() {
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[CrestHaven] Supabase initialized');
    checkAuthState();
    subscribeToChat();
  } catch (e) {
    console.warn('[CrestHaven] Supabase not configured. Using demo data.', e.message);
  }
}

// ============================================================
// AUTH
// ============================================================
async function checkAuthState() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    updateNavForUser();
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateNavForUser();
  });
}

function updateNavForUser() {
  const navActions = document.querySelector('.nav-actions');
  if (!navActions) return;
  if (currentUser) {
    const email = currentUser.email || '';
    const initials = email.slice(0, 2).toUpperCase();
    const existing = navActions.querySelector('.user-pill');
    if (!existing) {
      const pill = document.createElement('button');
      pill.className = 'user-pill btn-ghost';
      pill.innerHTML = `<span class="logo-mark small" style="width:32px;height:32px;font-size:12px">${initials}</span>`;
      pill.onclick = logoutUser;
      pill.title = `Signed in as ${email}. Click to sign out.`;
      navActions.insertBefore(pill, navActions.firstChild);
    }
    // Hide sign in button
    const signInBtn = navActions.querySelector('.btn-ghost:not(.user-pill)');
    if (signInBtn) signInBtn.style.display = 'none';
  }
}

async function loginUser() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const msg = document.getElementById('loginMsg');
  if (!email || !password) {
    showFormMsg('loginMsg', 'Please fill in all fields.', 'error');
    return;
  }
  if (!supabase) {
    showFormMsg('loginMsg', '⚙️ Supabase not configured. Connect your database to enable auth.', 'error');
    return;
  }
  const btn = document.querySelector('#loginForm .btn-primary');
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  btn.textContent = 'Sign In';
  btn.disabled = false;
  if (error) {
    showFormMsg('loginMsg', error.message, 'error');
  } else {
    showFormMsg('loginMsg', '✓ Signed in successfully!', 'success');
    setTimeout(() => closeModal('loginModal'), 1200);
    showToast('Welcome back to CrestHaven!', 'success');
  }
}

async function registerUser() {
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!firstName || !email || !password) {
    showFormMsg('registerMsg', 'Please fill in required fields.', 'error');
    return;
  }
  if (!supabase) {
    showFormMsg('registerMsg', '⚙️ Supabase not configured. Connect your database to enable registration.', 'error');
    return;
  }
  const btn = document.querySelector('#registerForm .btn-primary');
  btn.textContent = 'Creating account...';
  btn.disabled = true;
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { first_name: firstName, last_name: lastName, phone } }
  });
  btn.textContent = 'Create Account';
  btn.disabled = false;
  if (error) {
    showFormMsg('registerMsg', error.message, 'error');
  } else {
    showFormMsg('registerMsg', '✓ Account created! Please check your email to verify.', 'success');
    setTimeout(() => closeModal('loginModal'), 2000);
  }
}

async function logoutUser() {
  if (!supabase) return;
  await supabase.auth.signOut();
  currentUser = null;
  const pill = document.querySelector('.user-pill');
  if (pill) pill.remove();
  const signInBtn = document.querySelector('.nav-actions .btn-ghost');
  if (signInBtn) signInBtn.style.display = '';
  showToast('Signed out successfully');
}

function showPasswordReset() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    showFormMsg('loginMsg', 'Enter your email above first.', 'error');
    return;
  }
  if (!supabase) return;
  supabase.auth.resetPasswordForEmail(email).then(({ error }) => {
    if (error) showFormMsg('loginMsg', error.message, 'error');
    else showFormMsg('loginMsg', '✓ Password reset email sent!', 'success');
  });
}

// ============================================================
// PROPERTIES
// ============================================================
const DEMO_PROPERTIES = [
  {
    id: 1,
    title: '4-Bedroom Smart Villa',
    type: 'villa',
    city: 'Bodija, Ibadan',
    price: 85000000,
    listing_type: 'sale',
    bedrooms: 4,
    bathrooms: 3,
    area_sqm: 320,
    is_smart: true,
    smart_features: ['Smart Security', 'Solar Power', 'Voice Control', 'AI Climate'],
    description: 'Luxurious 4-bedroom smart villa in Bodija GRA, fully equipped with IoT automation and solar power infrastructure.',
    image_url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80',
    contact_phone: '+234 800 000 0001'
  },
  {
    id: 2,
    title: '3-Bedroom Smart Bungalow',
    type: 'bungalow',
    city: 'Abeokuta, Ogun',
    price: 45000000,
    listing_type: 'sale',
    bedrooms: 3,
    bathrooms: 2,
    area_sqm: 200,
    is_smart: true,
    smart_features: ['Solar Power', 'Backup Power', 'Fiber Internet'],
    description: 'Eco-efficient 3-bedroom smart bungalow from the Olumo Horizon Estate, designed for professionals and commuters.',
    image_url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80',
    contact_phone: '+234 800 000 0002'
  },
  {
    id: 3,
    title: 'Executive Smart Apartment',
    type: 'apartment',
    city: 'Akure, Ondo',
    price: 1800000,
    listing_type: 'rent',
    bedrooms: 2,
    bathrooms: 2,
    area_sqm: 120,
    is_smart: true,
    smart_features: ['Smart Security', 'Voice Control', 'AI Climate'],
    description: 'Modern executive apartment at the Akure Crest Citadel targeting civil service professionals and corporate executives.',
    image_url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80',
    contact_phone: '+234 800 000 0003'
  },
  {
    id: 4,
    title: '5-Bedroom Luxury Duplex',
    type: 'duplex',
    city: 'Jericho GRA, Ibadan',
    price: 130000000,
    listing_type: 'sale',
    bedrooms: 5,
    bathrooms: 4,
    area_sqm: 480,
    is_smart: true,
    smart_features: ['Smart Security', 'Solar Power', 'Voice Control', 'AI Climate', 'Backup Power', 'Fiber Internet'],
    description: 'Ultra-premium duplex in Jericho GRA, converted from a legacy estate into a fully automated smart home masterpiece.',
    image_url: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=600&q=80',
    contact_phone: '+234 800 000 0004'
  },
  {
    id: 5,
    title: 'Smart Terrace House',
    type: 'terrace',
    city: 'Ile-Ife, Osun',
    price: 950000,
    listing_type: 'rent',
    bedrooms: 3,
    bathrooms: 3,
    area_sqm: 180,
    is_smart: false,
    smart_features: ['Backup Power'],
    description: 'Elegant 3-bedroom terrace in the CrestHaven Ife community near OAU, perfect for academics and diaspora returnees.',
    image_url: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=600&q=80',
    contact_phone: '+234 800 000 0005'
  },
  {
    id: 6,
    title: 'Premium Land Plot — 1000sqm',
    type: 'land',
    city: 'Ile-Ife, Osun',
    price: 22000000,
    listing_type: 'sale',
    bedrooms: 0,
    bathrooms: 0,
    area_sqm: 1000,
    is_smart: false,
    smart_features: [],
    description: 'Survey-certified 1000sqm residential plot in the CrestHaven Ife Estate with processed C of O. Ready to build.',
    image_url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&q=80',
    contact_phone: '+234 800 000 0006'
  },
  {
    id: 7,
    title: '2-Bedroom Smart Apartment',
    type: 'apartment',
    city: 'Bodija, Ibadan',
    price: 750000,
    listing_type: 'rent',
    bedrooms: 2,
    bathrooms: 2,
    area_sqm: 95,
    is_smart: true,
    smart_features: ['Smart Security', 'Voice Control'],
    description: 'Stylish 2-bedroom smart apartment in Bodija, retrofitted with modern automation including voice-activated controls.',
    image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&q=80',
    contact_phone: '+234 800 000 0007'
  },
  {
    id: 8,
    title: '4-Bedroom Eco-Smart Bungalow',
    type: 'bungalow',
    city: 'Abeokuta, Ogun',
    price: 68000000,
    listing_type: 'sale',
    bedrooms: 4,
    bathrooms: 3,
    area_sqm: 280,
    is_smart: true,
    smart_features: ['Solar Power', 'AI Climate', 'Backup Power', 'Fiber Internet'],
    description: 'Flagship eco-efficient 4-bedroom smart bungalow from the Olumo Horizon Estate with full solar grid and smart systems.',
    image_url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=80',
    contact_phone: '+234 800 000 0008'
  }
];

const DEMO_TESTIMONIALS = [
  {
    name: 'Dr. Taiwo Adesanya',
    role: 'OAU Lecturer, Ile-Ife',
    text: 'CrestHaven Homes delivered beyond expectations. My smart home in the Ife Estate is everything I was promised — the automation is seamless and the build quality is exceptional.',
    rating: 5,
    initials: 'TA'
  },
  {
    name: 'Engr. Bimpe Falola',
    role: 'Civil Servant, Akure',
    text: 'The Akure Crest Citadel apartment is exactly what I needed as an executive in the state capital. Modern, automated, secure — and the CrestHaven team made the purchase process effortless.',
    rating: 5,
    initials: 'BF'
  },
  {
    name: 'Alhaji Mustapha Abiodun',
    role: 'Diaspora Investor, UK-Nigeria',
    text: 'I invested in land through CrestHaven from the UK and the entire process was transparent, professional, and efficient. The title documentation was flawless. Highly recommended for diaspora investors.',
    rating: 5,
    initials: 'MA'
  }
];

async function fetchProperties(filter = 'all', search = '', reset = false) {
  if (reset) { propOffset = 0; activeFilter = filter; }
  const grid = document.getElementById('propGrid');
  if (propOffset === 0) { grid.innerHTML = '<div class="prop-placeholder">Loading properties...</div>'; }

  let data = [];
  let error = null;

  if (supabase && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
    let query = supabase.from('properties').select('*').eq('is_active', true).order('created_at', { ascending: false }).range(propOffset, propOffset + PROP_LIMIT - 1);
    if (filter === 'sale') query = query.eq('listing_type', 'sale');
    else if (filter === 'rent') query = query.eq('listing_type', 'rent');
    else if (filter === 'smart') query = query.eq('is_smart', true);
    if (search) query = query.ilike('title', `%${search}%`);
    const result = await query;
    data = result.data || [];
    error = result.error;
  } else {
    // Demo data
    data = DEMO_PROPERTIES.filter(p => {
      if (filter === 'sale') return p.listing_type === 'sale';
      if (filter === 'rent') return p.listing_type === 'rent';
      if (filter === 'smart') return p.is_smart;
      return true;
    }).filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.city.toLowerCase().includes(search.toLowerCase())).slice(propOffset, propOffset + PROP_LIMIT);
  }

  if (propOffset === 0) grid.innerHTML = '';
  if (data.length === 0 && propOffset === 0) {
    grid.innerHTML = '<div class="prop-placeholder">No properties found matching your criteria.</div>';
    return;
  }

  data.forEach(p => {
    grid.innerHTML += renderPropertyCard(p);
  });

  propOffset += data.length;
  const loadBtn = document.getElementById('loadMoreBtn');
  loadBtn.style.display = data.length < PROP_LIMIT ? 'none' : 'inline-block';
}

function renderPropertyCard(p) {
  const price = p.listing_type === 'rent'
    ? `₦${Number(p.price).toLocaleString()}/yr`
    : `₦${Number(p.price).toLocaleString()}`;
  const imgSrc = p.image_url || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80';
  const smartTag = p.is_smart ? '<span class="prop-smart-tag">⚡ Smart Home</span>' : '';
  const bedBath = p.bedrooms > 0 ? `<span class="prop-feat">🛏 ${p.bedrooms} Beds</span><span class="prop-feat">🚿 ${p.bathrooms} Baths</span>` : '';
  const area = p.area_sqm > 0 ? `<span class="prop-feat">📐 ${p.area_sqm}sqm</span>` : '';
  return `
    <div class="prop-card" onclick="openPropertyDetail(${p.id})">
      <div class="prop-img">
        <img src="${imgSrc}" alt="${p.title}" loading="lazy" />
        <span class="prop-badge badge-${p.listing_type}">${p.listing_type === 'sale' ? 'For Sale' : 'For Rent'}</span>
        ${smartTag}
      </div>
      <div class="prop-info">
        <div class="prop-price">${price}</div>
        <h4>${p.title}</h4>
        <div class="prop-location">📍 ${p.city}</div>
        <div class="prop-features">
          ${bedBath}
          ${area}
        </div>
        <div class="prop-actions">
          <button class="prop-btn-view" onclick="openPropertyDetail(${p.id}); event.stopPropagation()">View Details</button>
          <button class="prop-btn-fav" onclick="favouriteProperty(${p.id}); event.stopPropagation()" title="Save">♡</button>
        </div>
      </div>
    </div>
  `;
}

function openPropertyDetail(id) {
  const allProps = DEMO_PROPERTIES;
  let p = allProps.find(x => x.id === id);
  if (!p) return;
  const price = p.listing_type === 'rent' ? `₦${Number(p.price).toLocaleString()}/yr` : `₦${Number(p.price).toLocaleString()}`;
  const smartFeats = (p.smart_features || []).map(f => `<span>${f}</span>`).join('');
  const bedsInfo = p.bedrooms > 0 ? `<div class="prop-meta-item"><strong>${p.bedrooms}</strong><span>Bedrooms</span></div><div class="prop-meta-item"><strong>${p.bathrooms}</strong><span>Bathrooms</span></div>` : '';
  document.getElementById('propertyModalContent').innerHTML = `
    <div class="prop-modal-img"><img src="${p.image_url || ''}" alt="${p.title}" /></div>
    <div style="padding: 0 4px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <span class="prop-badge badge-${p.listing_type}" style="position:static;margin-bottom:10px;display:inline-block">${p.listing_type === 'sale' ? 'For Sale' : 'For Rent'}</span>
          <h2 style="font-family:var(--font-display);font-size:28px;color:var(--ivory);font-weight:400">${p.title}</h2>
          <div style="color:var(--ivory-muted);font-size:14px;margin-top:6px">📍 ${p.city}</div>
        </div>
        <div style="font-family:var(--font-display);font-size:32px;color:var(--gold);font-weight:600;flex-shrink:0">${price}</div>
      </div>
      <div class="prop-modal-meta">
        ${bedsInfo}
        ${p.area_sqm > 0 ? `<div class="prop-meta-item"><strong>${p.area_sqm}sqm</strong><span>Area</span></div>` : ''}
      </div>
      <p style="color:var(--ivory-muted);font-size:14px;line-height:1.7;margin:16px 0">${p.description}</p>
      ${smartFeats ? `<div><div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Smart Features</div><div class="prop-modal-features">${smartFeats}</div></div>` : ''}
      <div style="margin-top:24px;display:flex;gap:12px">
        <button class="btn-primary" style="flex:1" onclick="enquireProperty(${p.id})">Enquire Now</button>
        <a href="tel:${p.contact_phone}" class="btn-outline" style="flex:1;text-align:center;display:flex;align-items:center;justify-content:center">📞 Call Agent</a>
      </div>
    </div>
  `;
  openModal('propertyModal');
}

function enquireProperty(propId) {
  closeModal('propertyModal');
  const section = document.getElementById('contact');
  section.scrollIntoView({ behavior: 'smooth' });
  const interest = document.getElementById('cfInterest');
  interest.value = 'buy';
  document.getElementById('cfMessage').value = `I am interested in property ID: ${propId}. Please contact me with more information.`;
}

async function favouriteProperty(id) {
  if (!currentUser) {
    showToast('Please sign in to save favourites');
    openModal('loginModal');
    return;
  }
  if (supabase && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
    await supabase.from('favourites').upsert({ user_id: currentUser.id, property_id: id });
  }
  showToast('Property saved to favourites ♡');
}

function loadMoreProperties() {
  const search = document.getElementById('propSearch').value.trim();
  fetchProperties(activeFilter, search);
}

function filterProperties() {
  const search = document.getElementById('propSearch').value.trim();
  fetchProperties(activeFilter, search, true);
}

// Filter tab clicks
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      fetchProperties(this.dataset.filter, document.getElementById('propSearch').value, true);
    });
  });
  document.getElementById('propSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') filterProperties();
  });
});

// ============================================================
// CONTACT / ENQUIRY FORM
// ============================================================
document.getElementById('contactForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const data = {
    first_name: document.getElementById('cfFirstName').value.trim(),
    last_name: document.getElementById('cfLastName').value.trim(),
    email: document.getElementById('cfEmail').value.trim(),
    phone: document.getElementById('cfPhone').value.trim(),
    interest: document.getElementById('cfInterest').value,
    message: document.getElementById('cfMessage').value.trim()
  };
  if (!data.first_name || !data.email) {
    showFormMsg('contactMsg', 'Please fill in your name and email.', 'error');
    return;
  }
  const btn = document.getElementById('contactSubmitBtn');
  btn.textContent = 'Sending...';
  btn.disabled = true;

  if (supabase && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
    const { error } = await supabase.from('enquiries').insert([data]);
    btn.textContent = 'Send Enquiry';
    btn.disabled = false;
    if (error) {
      showFormMsg('contactMsg', 'Failed to send. Please try again.', 'error');
    } else {
      showFormMsg('contactMsg', '✓ Enquiry sent! Our team will contact you within 24 hours.', 'success');
      document.getElementById('contactForm').reset();
      showToast('Enquiry sent successfully!', 'success');
    }
  } else {
    // Demo: simulate success
    setTimeout(() => {
      btn.textContent = 'Send Enquiry';
      btn.disabled = false;
      showFormMsg('contactMsg', '✓ Enquiry received! (Demo mode — connect Supabase to enable real submissions)', 'success');
      document.getElementById('contactForm').reset();
    }, 1200);
  }
});

// ============================================================
// PROPERTY LISTING SUBMISSION
// ============================================================
async function submitListing() {
  const data = {
    title: document.getElementById('lTitle').value.trim(),
    type: document.getElementById('lType').value,
    city: document.getElementById('lCity').value,
    listing_type: document.getElementById('lListing').value,
    price: parseFloat(document.getElementById('lPrice').value),
    bedrooms: parseInt(document.getElementById('lBedrooms').value),
    address: document.getElementById('lAddress').value.trim(),
    description: document.getElementById('lDesc').value.trim(),
    contact_phone: document.getElementById('lContactPhone').value.trim(),
    is_smart: false,
    smart_features: [],
    is_active: false  // Pending review
  };

  // Collect smart features
  document.querySelectorAll('#listingModal .checkbox-item input:checked').forEach(cb => {
    data.smart_features.push(cb.value);
    if (data.smart_features.length > 0) data.is_smart = true;
  });

  if (!data.title || !data.price) {
    showFormMsg('listingMsg', 'Please fill in the property title and price.', 'error');
    return;
  }
  const btn = document.querySelector('#listingModal .btn-primary');
  btn.textContent = 'Submitting...';
  btn.disabled = true;

  if (supabase && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
    const { error } = await supabase.from('properties').insert([{ ...data, submitted_by: currentUser?.id }]);
    btn.textContent = 'Submit Property Listing';
    btn.disabled = false;
    if (error) {
      showFormMsg('listingMsg', 'Submission failed. Please try again.', 'error');
    } else {
      showFormMsg('listingMsg', '✓ Listing submitted for review! We\'ll be in touch within 48 hours.', 'success');
      showToast('Property listing submitted!', 'success');
    }
  } else {
    setTimeout(() => {
      btn.textContent = 'Submit Property Listing';
      btn.disabled = false;
      showFormMsg('listingMsg', '✓ Listing submitted! (Demo mode — connect Supabase for full functionality)', 'success');
    }, 1200);
  }
}

// ============================================================
// LIVE CHAT
// ============================================================
const CHAT_RESPONSES = {
  default: ["Thank you for reaching out to CrestHaven Homes! 🏡 One of our agents will be with you shortly. In the meantime, feel free to browse our properties.", "Thanks for your message! Our team typically responds within a few minutes. How can we assist you today?"],
  buy: ["Excellent choice! We have premium properties available across Ibadan, Ile-Ife, Akure, and Abeokuta. What's your budget range and preferred city?", "We'd love to help you find your perfect home. Our current sale listings range from ₦22M for land plots to ₦130M for luxury duplexes. Which city are you interested in?"],
  rent: ["We have smart apartments and terrace houses available for rent. Prices start from ₦750,000/year. Which city are you looking at?", "Great! We have rental units in Bodija Ibadan, Ile-Ife, and Akure. What's your bedroom requirement?"],
  smart: ["Our smart homes feature AI-driven climate control, biometric security, voice activation, and solar power systems. Every CrestHaven property meets COREN engineering standards. Would you like a tour?", "CrestHaven smart homes are fully automated with IoT infrastructure, backup power, and fiber-optic connectivity. Want to know more about a specific project?"],
  invest: ["Excellent! We offer premium land banking opportunities with processed titles across all four strategic cities. ROI projections are strong, especially in Ile-Ife and Abeokuta. Shall we schedule a call?", "CrestHaven's land banking program offers secure, title-verified plots in high-growth corridors. Minimum investment from ₦22M for 1000sqm. Interested?"],
  hello: ["Hello! Welcome to CrestHaven Homes Ltd. 🏡 How can we help you today?", "Hi there! Great to connect with you. We're Nigeria's premier smart real estate developer. What brings you to CrestHaven today?"],
  contact: ["Our team is available Mon–Fri 8AM–6PM, and Sat 9AM–3PM. You can also reach us at info@cresthavenhomes.ng. Would you like to schedule a consultation?", "You can call us at +234 800 CRESTHAVEN or visit any of our city offices in Ibadan, Ile-Ife, Akure, or Abeokuta."],
  price: ["Our properties range from ₦22M for land plots to ₦130M for luxury duplexes, with rental units from ₦750,000/year. What's your budget?", "We have options for various budgets! Smart apartments from ₦750K/yr, bungalows from ₦45M. What are you looking for?"]
};

function toggleChat() {
  const widget = document.getElementById('chatWidget');
  const badge = document.getElementById('chatBadge');
  chatOpen = !chatOpen;
  if (chatOpen) {
    widget.classList.add('open');
    badge.style.display = 'none';
    if (!currentSessionId) {
      currentSessionId = 'session_' + Date.now();
      setTimeout(() => {
        addChatMessage('agent', "👋 Hello! Welcome to CrestHaven Homes. I'm here to help you explore our premium smart properties across South-West Nigeria. What can I assist you with today?");
      }, 600);
    }
  } else {
    widget.classList.remove('open');
  }
}

function closeChat() {
  const widget = document.getElementById('chatWidget');
  widget.classList.remove('open');
  chatOpen = false;
}

function minimizeChat() {
  closeChat();
}

function sendQuickReply(text) {
  document.getElementById('chatInput').value = text;
  document.querySelector('.chat-welcome').style.display = 'none';
  sendChatMessage();
}

function handleChatKey(e) {
  if (e.key === 'Enter') sendChatMessage();
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  document.querySelector('.chat-welcome').style.display = 'none';

  addChatMessage('user', text);
  const typing = document.getElementById('chatTyping');
  typing.style.display = 'flex';

  // Save to Supabase if configured
  if (supabase && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
    supabase.from('chat_messages').insert([{
      session_id: currentSessionId,
      sender: 'user',
      message: text,
      user_id: currentUser?.id || null
    }]);
  }

  // AI response delay
  const delay = 800 + Math.random() * 800;
  setTimeout(() => {
    typing.style.display = 'none';
    const response = getChatResponse(text.toLowerCase());
    addChatMessage('agent', response);

    if (supabase && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
      supabase.from('chat_messages').insert([{
        session_id: currentSessionId,
        sender: 'agent',
        message: response,
        user_id: null
      }]);
    }
  }, delay);
}

function getChatResponse(text) {
  const responses = CHAT_RESPONSES;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  if (text.includes('buy') || text.includes('purchase') || text.includes('buying')) return pick(responses.buy);
  if (text.includes('rent') || text.includes('lease') || text.includes('rental')) return pick(responses.rent);
  if (text.includes('smart') || text.includes('iot') || text.includes('automat')) return pick(responses.smart);
  if (text.includes('invest') || text.includes('land') || text.includes('plot')) return pick(responses.invest);
  if (text.includes('hello') || text.includes('hi') || text.includes('good morning') || text.includes('hey')) return pick(responses.hello);
  if (text.includes('contact') || text.includes('call') || text.includes('email') || text.includes('phone')) return pick(responses.contact);
  if (text.includes('price') || text.includes('cost') || text.includes('how much') || text.includes('budget')) return pick(responses.price);
  return pick(responses.default);
}

function addChatMessage(sender, text) {
  const messages = document.getElementById('chatMessages');
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `chat-msg ${sender}`;
  div.innerHTML = `<div class="msg-bubble">${text}</div><div class="msg-time">${now}</div>`;
  messages.appendChild(div);
  const body = document.getElementById('chatBody');
  body.scrollTop = body.scrollHeight;
}

async function subscribeToChat() {
  if (!supabase || SUPABASE_URL === 'YOUR_SUPABASE_PROJECT_URL') return;
  // Subscribe to incoming agent messages for this session
  supabase.channel('chat').on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'chat_messages',
    filter: `sender=eq.agent_live`
  }, payload => {
    if (payload.new.session_id === currentSessionId) {
      addChatMessage('agent', payload.new.message);
    }
  }).subscribe();
}

// ============================================================
// TESTIMONIALS
// ============================================================
async function loadTestimonials() {
  let data = DEMO_TESTIMONIALS;
  if (supabase && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
    const result = await supabase.from('testimonials').select('*').eq('is_approved', true).order('created_at', { ascending: false }).limit(3);
    if (result.data && result.data.length > 0) data = result.data;
  }
  const grid = document.getElementById('testimonialsGrid');
  grid.innerHTML = data.map(t => `
    <div class="testimonial-card">
      <div class="testi-stars">${'★'.repeat(t.rating || 5)}</div>
      <p class="testi-text">"${t.text}"</p>
      <div class="testi-author">
        <div class="testi-avatar">${t.initials || (t.name || 'U').slice(0, 2).toUpperCase()}</div>
        <div>
          <div class="testi-name">${t.name}</div>
          <div class="testi-role">${t.role}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// NAV & UI UTILITIES
// ============================================================
function scrollTo(selector) {
  const el = document.querySelector(selector);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  nav.classList.toggle('scrolled', window.scrollY > 60);
  // Active link
  const sections = ['home', 'about', 'projects', 'properties', 'services', 'contact'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top <= 100 && rect.bottom >= 100) {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      const link = document.querySelector(`.nav-link[href="#${id}"]`);
      if (link) link.classList.add('active');
    }
  });
});

// Hamburger
document.getElementById('hamburger').addEventListener('click', function() {
  this.classList.toggle('open');
  document.getElementById('navLinks').classList.toggle('open');
});

// Close nav on link click (mobile)
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    document.getElementById('hamburger').classList.remove('open');
    document.getElementById('navLinks').classList.remove('open');
  });
});

// ============================================================
// MODALS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
    if (e.target === this) closeModal(this.id);
  });
});
// Close on ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
  }
});

function switchTab(tab, btn) {
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'flex' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'flex' : 'none';
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.className = 'toast', 3500);
}

function showFormMsg(id, message, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `form-message ${type}`;
  el.style.display = 'block';
}

// ============================================================
// CUSTOM CURSOR
// ============================================================
function initCursor() {
  const cursor = document.getElementById('cursor');
  const follower = document.getElementById('cursor-follower');
  let mouseX = 0, mouseY = 0, followerX = 0, followerY = 0;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
    cursor.style.left = mouseX + 'px';
    cursor.style.top = mouseY + 'px';
  });

  function animateFollower() {
    followerX += (mouseX - followerX) * 0.12;
    followerY += (mouseY - followerY) * 0.12;
    follower.style.left = followerX + 'px';
    follower.style.top = followerY + 'px';
    requestAnimationFrame(animateFollower);
  }
  animateFollower();
}

// ============================================================
// SCROLL ANIMATIONS
// ============================================================
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.project-card, .service-card, .testimonial-card, .pillar, .process-step, .prop-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });

  const observer2 = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.05 });

  document.querySelectorAll('.project-card, .service-card, .testimonial-card, .pillar, .process-step').forEach(el => {
    observer2.observe(el);
  });
}

// ============================================================
// LOADER
// ============================================================
function initLoader() {
  window.addEventListener('load', () => {
    setTimeout(() => {
      document.getElementById('loader').classList.add('fade-out');
      // Trigger hero animations
      document.querySelectorAll('.animate-up').forEach(el => {
        setTimeout(() => el.classList.add('visible'), 300);
      });
    }, 1800);
  });
}

// ============================================================
// BOOTSTRAP
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initCursor();
  initSupabase();
  fetchProperties('all', '', true);
  loadTestimonials();
  initScrollAnimations();

  // Show chat badge after 5 seconds
  setTimeout(() => {
    if (!chatOpen) {
      const badge = document.getElementById('chatBadge');
      badge.style.display = 'flex';
    }
  }, 5000);
});