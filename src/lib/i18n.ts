export type Locale = "en" | "hi";

const translations = {
  // Navigation
  "nav.dashboard": { en: "Dashboard", hi: "डैशबोर्ड" },
  "nav.sales": { en: "My Sales", hi: "मेरी बिक्री" },
  "nav.team": { en: "My Team", hi: "मेरी टीम" },
  "nav.wallet": { en: "Wallet", hi: "वॉलेट" },
  "nav.profile": { en: "Profile", hi: "प्रोफ़ाइल" },

  // Dashboard
  "dashboard.title": { en: "Dashboard", hi: "डैशबोर्ड" },
  "dashboard.welcome": { en: "Welcome back", hi: "वापसी पर स्वागत है" },
  "dashboard.wallet.title": { en: "Wallet Summary", hi: "वॉलेट सारांश" },
  "dashboard.wallet.total": { en: "Total Earned", hi: "कुल कमाई" },
  "dashboard.wallet.pending": { en: "Pending", hi: "बकाया" },
  "dashboard.wallet.paid": { en: "Paid Out", hi: "भुगतान किया" },
  "dashboard.referrals.title": { en: "Direct Referrals", hi: "प्रत्यक्ष रेफरल" },
  "dashboard.referrals.slots": { en: "of 3 slots filled", hi: "में से 3 स्लॉट भरे" },
  "dashboard.downline.title": { en: "Total Downline", hi: "कुल डाउनलाइन" },
  "dashboard.downline.members": { en: "members", hi: "सदस्य" },
  "dashboard.commissions.title": { en: "Recent Commissions", hi: "हालिया कमीशन" },
  "dashboard.commissions.empty": { en: "No commissions yet", hi: "अभी तक कोई कमीशन नहीं" },
  "dashboard.commissions.level": { en: "Level", hi: "स्तर" },
  "dashboard.referralLink.title": { en: "Your Referral Link", hi: "आपका रेफरल लिंक" },
  "dashboard.referralLink.copy": { en: "Copy", hi: "कॉपी" },
  "dashboard.referralLink.copied": { en: "Copied!", hi: "कॉपी हो गया!" },
  "dashboard.quickAction.submitSale": { en: "Submit Sale", hi: "बिक्री दर्ज करें" },

  // Time filters
  "filter.today": { en: "Today", hi: "आज" },
  "filter.thisWeek": { en: "This Week", hi: "इस सप्ताह" },
  "filter.thisMonth": { en: "This Month", hi: "इस महीने" },
  "filter.allTime": { en: "All Time", hi: "सभी समय" },

  // Profile
  "profile.title": { en: "Profile", hi: "प्रोफ़ाइल" },
  "profile.name": { en: "Name", hi: "नाम" },
  "profile.email": { en: "Email", hi: "ईमेल" },
  "profile.phone": { en: "Phone", hi: "फ़ोन" },
  "profile.language": { en: "Language", hi: "भाषा" },
  "profile.save": { en: "Save Changes", hi: "बदलाव सहेजें" },
  "profile.saved": { en: "Saved!", hi: "सहेजा गया!" },
  "profile.changePassword": { en: "Change Password", hi: "पासवर्ड बदलें" },
  "profile.currentPassword": { en: "Current Password", hi: "वर्तमान पासवर्ड" },
  "profile.newPassword": { en: "New Password", hi: "नया पासवर्ड" },
  "profile.confirmPassword": { en: "Confirm Password", hi: "पासवर्ड की पुष्टि करें" },
  "profile.passwordChanged": { en: "Password changed!", hi: "पासवर्ड बदल दिया गया!" },
  "profile.replayOnboarding": { en: "View Tutorial Again", hi: "ट्यूटोरियल दोबारा देखें" },

  // Validation
  "error.required": { en: "This field is required", hi: "यह फ़ील्ड आवश्यक है" },
  "error.phoneDuplicate": { en: "Phone number already in use", hi: "फ़ोन नंबर पहले से उपयोग में है" },
  "error.passwordWrong": { en: "Current password is incorrect", hi: "वर्तमान पासवर्ड गलत है" },
  "error.passwordShort": { en: "Password must be at least 8 characters", hi: "पासवर्ड कम से कम 8 अक्षरों का होना चाहिए" },
  "error.passwordMismatch": { en: "Passwords do not match", hi: "पासवर्ड मेल नहीं खाते" },
  "error.generic": { en: "Something went wrong", hi: "कुछ गलत हो गया" },

  // Onboarding
  "onboarding.step1.title": { en: "Welcome to Artilligence!", hi: "Artilligence में आपका स्वागत है!" },
  "onboarding.step1.desc": { en: "This is your dashboard where you can track your sales, commissions, and team.", hi: "यह आपका डैशबोर्ड है जहाँ आप अपनी बिक्री, कमीशन और टीम को ट्रैक कर सकते हैं।" },
  "onboarding.step2.title": { en: "Your Wallet", hi: "आपका वॉलेट" },
  "onboarding.step2.desc": { en: "Track your earnings here — total earned, pending, and paid out amounts.", hi: "अपनी कमाई यहाँ ट्रैक करें — कुल कमाई, बकाया और भुगतान की गई राशि।" },
  "onboarding.step3.title": { en: "Your Referral Link", hi: "आपका रेफरल लिंक" },
  "onboarding.step3.desc": { en: "Share this link to invite new members. You can have up to 3 direct referrals.", hi: "नए सदस्यों को आमंत्रित करने के लिए इस लिंक को शेयर करें। आप अधिकतम 3 प्रत्यक्ष रेफरल कर सकते हैं।" },
  "onboarding.step4.title": { en: "Submit Sales", hi: "बिक्री दर्ज करें" },
  "onboarding.step4.desc": { en: "Record your Exide battery sales here to earn commissions.", hi: "कमीशन कमाने के लिए अपनी Exide बैटरी बिक्री यहाँ दर्ज करें।" },
  "onboarding.step5.title": { en: "Your Team", hi: "आपकी टीम" },
  "onboarding.step5.desc": { en: "View your direct referrals and full downline tree here.", hi: "अपने प्रत्यक्ष रेफरल और पूर्ण डाउनलाइन ट्री यहाँ देखें।" },
  "onboarding.next": { en: "Next", hi: "अगला" },
  "onboarding.prev": { en: "Previous", hi: "पिछला" },
  "onboarding.done": { en: "Done", hi: "पूरा" },
  "onboarding.skip": { en: "Skip", hi: "छोड़ें" },

  // Sales
  "sales.title": { en: "My Sales", hi: "मेरी बिक्री" },
  "sales.submitSale": { en: "Submit Sale", hi: "बिक्री दर्ज करें" },
  "sales.newSale": { en: "New Sale", hi: "नई बिक्री" },
  "sales.billCode": { en: "Bill Code", hi: "बिल कोड" },
  "sales.billCodePlaceholder": { en: "e.g. MB-12345", hi: "उदा. MB-12345" },
  "sales.saleDate": { en: "Sale Date", hi: "बिक्री तिथि" },
  "sales.products": { en: "Products", hi: "उत्पाद" },
  "sales.selectProduct": { en: "Select product", hi: "उत्पाद चुनें" },
  "sales.quantity": { en: "Qty", hi: "मात्रा" },
  "sales.price": { en: "Price", hi: "कीमत" },
  "sales.subtotal": { en: "Subtotal", hi: "उप-योग" },
  "sales.addProduct": { en: "+ Add Product", hi: "+ उत्पाद जोड़ें" },
  "sales.removeProduct": { en: "Remove", hi: "हटाएं" },
  "sales.customerName": { en: "Customer Name", hi: "ग्राहक का नाम" },
  "sales.customerPhone": { en: "Customer Phone", hi: "ग्राहक का फ़ोन" },
  "sales.billPhoto": { en: "Bill Photo", hi: "बिल फ़ोटो" },
  "sales.billPhotoHint": { en: "JPG, PNG, or PDF (max 5MB)", hi: "JPG, PNG, या PDF (अधिकतम 5MB)" },
  "sales.total": { en: "Total", hi: "कुल" },
  "sales.submit": { en: "Submit Sale", hi: "बिक्री दर्ज करें" },
  "sales.submitting": { en: "Submitting...", hi: "दर्ज हो रही है..." },
  "sales.submitted": { en: "Sale submitted successfully!", hi: "बिक्री सफलतापूर्वक दर्ज हो गई!" },
  "sales.cancel": { en: "Cancel", hi: "रद्द करें" },

  // Sales tabs
  "sales.tab.all": { en: "All", hi: "सभी" },
  "sales.tab.pending": { en: "Pending", hi: "लंबित" },
  "sales.tab.approved": { en: "Approved", hi: "स्वीकृत" },
  "sales.tab.rejected": { en: "Rejected", hi: "अस्वीकृत" },
  "sales.tab.returned": { en: "Returned", hi: "वापस" },

  // Sales status
  "sales.status.PENDING": { en: "Pending", hi: "लंबित" },
  "sales.status.APPROVED": { en: "Approved", hi: "स्वीकृत" },
  "sales.status.REJECTED": { en: "Rejected", hi: "अस्वीकृत" },
  "sales.status.RETURNED": { en: "Returned", hi: "वापस" },

  // Sales list
  "sales.empty": { en: "No sales yet", hi: "अभी तक कोई बिक्री नहीं" },
  "sales.emptyTab": { en: "No sales in this category", hi: "इस श्रेणी में कोई बिक्री नहीं" },
  "sales.rejectionReason": { en: "Rejection reason", hi: "अस्वीकृति का कारण" },
  "sales.returnReason": { en: "Return reason", hi: "वापसी का कारण" },
  "sales.detail.title": { en: "Sale Details", hi: "बिक्री विवरण" },
  "sales.detail.items": { en: "Items", hi: "आइटम" },
  "sales.detail.photo": { en: "Bill Photo", hi: "बिल फ़ोटो" },

  // Sales validation
  "sales.error.billCodeRequired": { en: "Bill code is required", hi: "बिल कोड आवश्यक है" },
  "sales.error.billCodeFormat": { en: "Bill code format is invalid", hi: "बिल कोड प्रारूप अमान्य है" },
  "sales.error.billCodeDuplicate": { en: "This bill code has already been submitted", hi: "यह बिल कोड पहले से दर्ज है" },
  "sales.error.saleDateRequired": { en: "Sale date is required", hi: "बिक्री तिथि आवश्यक है" },
  "sales.error.futureDateNotAllowed": { en: "Sale date cannot be in the future", hi: "बिक्री तिथि भविष्य में नहीं हो सकती" },
  "sales.error.productsRequired": { en: "At least one product is required", hi: "कम से कम एक उत्पाद आवश्यक है" },
  "sales.error.customerNameRequired": { en: "Customer name is required", hi: "ग्राहक का नाम आवश्यक है" },
  "sales.error.customerPhoneRequired": { en: "Customer phone is required", hi: "ग्राहक का फ़ोन आवश्यक है" },
  "sales.error.photoRequired": { en: "Bill photo is required", hi: "बिल फ़ोटो आवश्यक है" },
  "sales.error.invalidFileType": { en: "Invalid file type. Only JPG, PNG, and PDF are accepted", hi: "अमान्य फ़ाइल प्रकार। केवल JPG, PNG, और PDF स्वीकार्य हैं" },
  "sales.error.fileTooLarge": { en: "File size exceeds 5MB limit", hi: "फ़ाइल का आकार 5MB सीमा से अधिक है" },
  "sales.error.rateLimitDaily": { en: "You've reached the maximum sales submissions for today. Please try again tomorrow.", hi: "आपने आज की अधिकतम बिक्री सीमा पार कर ली है। कृपया कल पुनः प्रयास करें।" },
  "sales.error.rateLimitWeekly": { en: "You've reached the maximum sales submissions for this week.", hi: "आपने इस सप्ताह की अधिकतम बिक्री सीमा पार कर ली है।" },
  "sales.error.rateLimitGap": { en: "Please wait before submitting another sale.", hi: "कृपया अगली बिक्री दर्ज करने से पहले प्रतीक्षा करें।" },

  // Wallet page
  "wallet.title": { en: "Wallet", hi: "वॉलेट" },
  "wallet.transactions": { en: "Transaction History", hi: "लेनदेन इतिहास" },
  "wallet.noTransactions": { en: "No transactions yet", hi: "अभी तक कोई लेनदेन नहीं" },
  "wallet.type.COMMISSION": { en: "Commission", hi: "कमीशन" },
  "wallet.type.COMMISSION_REVERSAL": { en: "Commission Reversal", hi: "कमीशन वापसी" },
  "wallet.type.PAYOUT": { en: "Payout", hi: "भुगतान" },
  "wallet.type.ADJUSTMENT": { en: "Adjustment", hi: "समायोजन" },

  // Common
  "common.logout": { en: "Logout", hi: "लॉगआउट" },
  "common.loading": { en: "Loading...", hi: "लोड हो रहा है..." },
  "common.noData": { en: "No data available", hi: "कोई डेटा उपलब्ध नहीं" },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, locale: Locale): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[locale] || entry.en;
}

export function formatINR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "₹0";
  // Indian number system: last 3 digits, then groups of 2
  const isNegative = num < 0;
  const abs = Math.abs(num);
  const [intPart, decPart] = abs.toFixed(2).split(".");
  let formatted: string;
  if (intPart.length <= 3) {
    formatted = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  return (isNegative ? "-" : "") + "₹" + formatted + "." + decPart;
}
