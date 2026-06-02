// ============== Нэми App Helpers ==============
(function(){
  const D = window.NEMI_DATA;

  // Simple icon set
  const I = {
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    heartFill:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    bed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>',
    bath:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><line x1="10" y1="5" x2="8" y2="7"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="7" y1="19" x2="7" y2="21"/><line x1="17" y1="19" x2="17" y2="21"/></svg>',
    area:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3z"/><path d="M14 14h7v7h-7z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/></svg>',
    pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    verified:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z"/><path d="m9 12 2 2 4-4"/></svg>',
    sparkle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13"/></svg>',
    ai:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 4.8L19 9.7l-3.7 3.5.9 5.1L12 16l-4.2 2.3.9-5.1L5 9.7l5.1-1.9L12 3z"/></svg>',
    user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21c1.5-3 4-5 6.5-5s5 2 6.5 5"/></svg>',
    home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
    chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    cog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    filter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    map:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    car:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M5 17l-2-5 2-5h14l2 5-2 5M5 17v3M19 17v3M7 12h2M15 12h2"/></svg>',
    arrowRight:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    arrowUp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    arrowDown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
    star:'<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
    shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    flame:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.4 0 2.5-1 2.5-2.5 0-1.5-1-2-1-3.5 0-2 2-2 2-4 0-1.5-1-3-3-3-2.5 0-4 2-4 4 0 1.5.5 2.5.5 4 0 1-.5 1.5-1 2"/><path d="M14 19.5A6.5 6.5 0 0 1 7.5 13c0-2.5 1-3.5 1-5C8.5 5 6 4 6 4s-1 1.5-1 4 1 5 1 7c0 3.5 3 6.5 6.5 6.5 1.5 0 3-1 3-2.5 0-1-1-1.5-1.5-1.5s-1 .5-1 1z"/></svg>',
    building:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6"/><line x1="15" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="9" y2="10"/><line x1="15" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="9" y2="14"/><line x1="15" y1="14" x2="15" y2="14"/><line x1="10" y1="22" x2="10" y2="18"/><line x1="14" y1="22" x2="14" y2="18"/></svg>',
    inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    pkg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    activity:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.5 14.7A2 2 0 0 0 3.5 22h17a2 2 0 0 0 1.71-3.44l-8.5-14.7a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    coins:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/></svg>',
    logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    facebook:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.51 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.25 0-1.64.77-1.64 1.57V12h2.78l-.44 2.9h-2.34v6.98A10 10 0 0 0 22 12z"/></svg>',
    google:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.05 1.07-2.7 2.27-5.59 2.27-4.45 0-7.9-3.5-7.9-7.94S8.55 4.69 13 4.69c2.39 0 4.18.93 5.4 2.06l2.34-2.32C19.13 2.97 16.79 2 13 2 6.96 2 2 6.85 2 12.85S6.96 24 13 24c3.27 0 5.7-1.07 7.62-3.05 1.97-1.97 2.58-4.73 2.58-6.97 0-.7-.06-1.34-.16-1.86h-10.6z"/></svg>',
  };

  window.NEMI = { I, D };

  // Brand logo (inline SVG so we can recolor the text via currentColor / explicit fill)
  // Original artwork preserved; orange marks keep their hardcoded #FFA52E, text uses passed color.
  window.NEMI.logoSVG = function(color, sizeClass) {
    color = color || 'currentColor';
    sizeClass = sizeClass || 'logo-md';
    return `<svg class="logo ${sizeClass}" viewBox="0 0 1067 324" xmlns="http://www.w3.org/2000/svg" aria-label="Нэми" role="img">
  <g transform="translate(-647.039012,-1592.302406)">
    <g transform="matrix(7.08041,0,0,7.08041,-6972.709199,-10396.509937)">
      <g transform="matrix(-0.059534,0,0.027041,0.046809,1071.995945,1644.824353)"><rect x="178.755" y="1274.149" width="127.915" height="479.788" fill="#FFA52E"/></g>
      <g transform="matrix(0.059534,0,-0.025052,0.070214,1109.4707,1615.003436)"><rect x="178.755" y="1274.149" width="127.915" height="479.788" fill="#FFA52E"/></g>
      <g transform="matrix(0.059534,0,-0.025052,0.070214,1134.752825,1603.774204)"><rect x="178.755" y="1274.149" width="127.915" height="479.788" fill="#FFA52E"/></g>
    </g>
    <g transform="matrix(6.696748,0,0,6.696748,-6486.765921,-8685.935813)" fill="${color}">
      <path d="M1118.725,1556.533L1124.125,1556.533L1124.125,1560.333L1124.225,1560.433C1125.092,1559 1126.225,1557.875 1127.625,1557.058C1129.025,1556.241 1130.575,1555.833 1132.275,1555.833C1135.108,1555.833 1137.342,1556.566 1138.975,1558.033C1140.608,1559.5 1141.425,1561.7 1141.425,1564.633L1141.425,1582.383L1135.725,1582.383L1135.725,1566.133C1135.658,1564.1 1135.225,1562.625 1134.425,1561.708C1133.625,1560.791 1132.375,1560.333 1130.675,1560.333C1129.708,1560.333 1128.842,1560.508 1128.075,1560.858C1127.308,1561.208 1126.658,1561.691 1126.125,1562.308C1125.592,1562.925 1125.175,1563.65 1124.875,1564.483C1124.575,1565.316 1124.425,1566.2 1124.425,1567.133L1124.425,1582.383L1118.725,1582.383L1118.725,1556.533Z"/>
      <path d="M1165.175,1567.183C1165.108,1566.283 1164.917,1565.416 1164.6,1564.583C1164.283,1563.75 1163.85,1563.025 1163.3,1562.408C1162.75,1561.791 1162.083,1561.291 1161.3,1560.908C1160.517,1560.525 1159.642,1560.333 1158.675,1560.333C1157.675,1560.333 1156.767,1560.508 1155.95,1560.858C1155.133,1561.208 1154.433,1561.691 1153.85,1562.308C1153.267,1562.925 1152.8,1563.65 1152.45,1564.483C1152.1,1565.316 1151.908,1566.216 1151.875,1567.183L1165.175,1567.183ZM1151.875,1570.933C1151.875,1571.933 1152.017,1572.9 1152.3,1573.833C1152.583,1574.766 1153.008,1575.583 1153.575,1576.283C1154.142,1576.983 1154.858,1577.541 1155.725,1577.958C1156.592,1578.375 1157.625,1578.583 1158.825,1578.583C1160.492,1578.583 1161.833,1578.225 1162.85,1577.508C1163.867,1576.791 1164.625,1575.716 1165.125,1574.283L1170.525,1574.283C1170.225,1575.683 1169.708,1576.933 1168.975,1578.033C1168.242,1579.133 1167.358,1580.058 1166.325,1580.808C1165.292,1581.558 1164.133,1582.125 1162.85,1582.508C1161.567,1582.891 1160.225,1583.083 1158.825,1583.083C1156.792,1583.083 1154.992,1582.75 1153.425,1582.083C1151.858,1581.416 1150.533,1580.483 1149.45,1579.283C1148.367,1578.083 1147.55,1576.65 1147,1574.983C1146.45,1573.316 1146.175,1571.483 1146.175,1569.483C1146.175,1567.65 1146.467,1565.908 1147.05,1564.258C1147.633,1562.608 1148.467,1561.158 1149.55,1559.908C1150.633,1558.658 1151.942,1557.666 1153.475,1556.933C1155.008,1556.2 1156.742,1555.833 1158.675,1555.833C1160.708,1555.833 1162.533,1556.258 1164.15,1557.108C1165.767,1557.958 1167.108,1559.083 1168.175,1560.483C1169.242,1561.883 1170.017,1563.491 1170.5,1565.308C1170.983,1567.125 1171.108,1569 1170.875,1570.933L1151.875,1570.933Z"/>
      <path d="M1175.225,1556.533L1180.625,1556.533L1180.625,1560.133L1180.775,1560.133C1181.208,1559.5 1181.675,1558.916 1182.175,1558.383C1182.675,1557.85 1183.233,1557.4 1183.85,1557.033C1184.467,1556.666 1185.175,1556.375 1185.975,1556.158C1186.775,1555.941 1187.692,1555.833 1188.725,1555.833C1190.292,1555.833 1191.75,1556.183 1193.1,1556.883C1194.45,1557.583 1195.408,1558.666 1195.975,1560.133C1196.942,1558.8 1198.058,1557.75 1199.325,1556.983C1200.592,1556.216 1202.175,1555.833 1204.075,1555.833C1206.808,1555.833 1208.933,1556.5 1210.45,1557.833C1211.967,1559.166 1212.725,1561.4 1212.725,1564.533L1212.725,1582.383L1207.025,1582.383L1207.025,1567.283C1207.025,1566.25 1206.992,1565.308 1206.925,1564.458C1206.858,1563.608 1206.667,1562.875 1206.35,1562.258C1206.033,1561.641 1205.558,1561.166 1204.925,1560.833C1204.292,1560.5 1203.425,1560.333 1202.325,1560.333C1200.392,1560.333 1198.992,1560.933 1198.125,1562.133C1197.258,1563.333 1196.825,1565.033 1196.825,1567.233L1196.825,1582.383L1191.125,1582.383L1191.125,1565.783C1191.125,1563.983 1190.8,1562.625 1190.15,1561.708C1189.5,1560.791 1188.308,1560.333 1186.575,1560.333C1185.842,1560.333 1185.133,1560.483 1184.45,1560.783C1183.767,1561.083 1183.167,1561.516 1182.65,1562.083C1182.133,1562.65 1181.717,1563.35 1181.4,1564.183C1181.083,1565.016 1180.925,1565.966 1180.925,1567.033L1180.925,1582.383L1175.225,1582.383L1175.225,1556.533Z"/>
      <path d="M1218.875,1546.683L1224.575,1546.683L1224.575,1552.083L1218.875,1552.083L1218.875,1546.683ZM1218.875,1556.533L1224.575,1556.533L1224.575,1582.383L1218.875,1582.383L1218.875,1556.533Z"/>
    </g>
  </g>
</svg>`;
  };

  // Brand bar component (used across pages)
  window.NEMI.topbar = function(active) {
    const items = [
      ["index.html","Нүүр","home"],
      ["listings.html","Зар","listings"],
      ["agents.html","Агентууд","agents"],
      ["home-loans.html","Зээл","loans"],
      ["ai.html","AI","ai"],
      ["agent.html","Агент","agent"],
      ["office.html","Оффис","office"],
    ];
    return `
      <header class="topbar">
        <div class="container-wide topbar-inner">
          <a href="index.html" class="brand">${NEMI.logoSVG('#0F172A','logo-md')}</a>
          <nav class="nav">
            ${items.map(i => `<a href="${i[0]}" class="${active===i[2]?'active':''}">${i[1]}</a>`).join('')}
          </nav>
          <div class="topbar-actions">
            <a href="agent.html" class="btn btn-ghost hide-sm">${I.plus} Зар оруулах</a>
            <a href="favorites.html" class="btn btn-secondary hide-sm">${I.heart} Хадгалсан</a>
            <a href="login.html" class="btn btn-primary">${I.user} Нэвтрэх</a>
          </div>
        </div>
      </header>`;
  };

  // Footer
  window.NEMI.footer = function() {
    return `
      <footer class="footer">
        <div class="container">
          <!-- ============ MAIN 4-COLUMN ============ -->
          <div class="footer-main">

            <!-- COL 1: Brand -->
            <div class="footer-brand-col">
              <div class="brand">${NEMI.logoSVG('#fff','logo-md')}</div>
              <p class="t">Баталгаатай үл хөдлөхийн платформ. Худалдан авагч, агент, оффисуудыг AI-аар нэгтгэсэн.</p>
              <a href="agent-signup.html" class="footer-cta">${I.building} Агент болж нэгдэх ${I.arrowRight}</a>
              <div class="footer-stats">
                <div><b>12,480+</b><span>Идэвхтэй зар</span></div>
                <div><b>320+</b><span>Баталгаажсан агент</span></div>
                <div><b>28</b><span>Хамтрагч оффис</span></div>
              </div>
            </div>

            <!-- COL 2: Users -->
            <div>
              <h4>Хэрэглэгчид</h4>
              <a href="listings.html">Зар хайх</a>
              <a href="agents.html">Агент хайх</a>
              <a href="home-loans.html">Орон сууцны зээл</a>
              <a href="favorites.html">Хадгалсан зар</a>
              <a href="recently-viewed.html">Сүүлд үзсэн</a>
              <a href="tours.html">Үзлэгийн цаг</a>
              <a href="my-home.html">Миний гэр</a>
              <a href="your-rental.html">Миний түрээс</a>
              <a href="my-team.html">Миний баг</a>
              <a href="account.html">Дансны тохиргоо</a>
            </div>

            <!-- COL 3: Professionals -->
            <div>
              <h4>Мэргэжилтнүүд</h4>
              <a href="partners.html" style="color:#FFA52E"><b>⭐ Нэми Premier</b></a>
              <a href="agent-signup.html">Агент болж нэгдэх</a>
              <a href="agent.html">Агентын самбар</a>
              <a href="office.html">Оффисын админ</a>
              <a href="rental-manager.html">Түрээс удирдах</a>
              <a href="ai.html">AI боломжууд</a>
              <a href="#">MLS / API</a>
              <a href="#">Сургалт</a>
            </div>

            <!-- COL 4: Company -->
            <div>
              <h4>Нэми</h4>
              <a href="#">Бидний тухай</a>
              <a href="news.html">Мэдээ ба блог</a>
              <a href="news.html">Зах зээлийн судалгаа</a>
              <a href="#">Ажлын байр</a>
              <a href="#">Тусламжийн төв</a>
              <a href="#">Сурах төв</a>
              <a href="#">Холбоо барих</a>
              <a href="#">Хэвлэлийн булан</a>
            </div>
          </div>

          <!-- ============ STRIP: apps + banks + lang ============ -->
          <div class="footer-strip">
            <div class="apps-row">
              <span class="lbl">📱 Гар утсаны апп</span>
              <a class="app-badge" href="#">
                <span style="font-size:18px"></span>
                <div>
                  <span class="store">App Store</span>
                  <span class="nm">iOS</span>
                </div>
              </a>
              <a class="app-badge" href="#">
                <span style="font-size:18px">▶</span>
                <div>
                  <span class="store">Play Store</span>
                  <span class="nm">Android</span>
                </div>
              </a>
            </div>

            <div class="banks-row">
              <span class="lbl">🏦 Хамтрагч</span>
              <span style="color:#34A853">Хаан банк</span>
              <span style="color:#E11D48">Голомт</span>
              <span style="color:#1D4ED8">ХХБ</span>
              <span style="color:#F59E0B">QPay</span>
              <span style="color:#0EA5E9">Хас</span>
            </div>

            <div></div>

            <div class="lang-row">
              <span class="lbl">🌐</span>
              <a class="active">🇲🇳 Монгол</a>
              <a>🇺🇸 EN</a>
              <a>🇨🇳 中文</a>
            </div>
          </div>

          <!-- ============ BOTTOM LEGAL ============ -->
          <div class="footer-bottom">
            <div class="fb-left">
              © 2026 Нэми технологи. Бүх эрх хуулиар хамгаалагдсан. · v1.0 prototype
            </div>
            <div class="fb-right">
              <a href="#">Үйлчилгээний нөхцөл</a>
              <a href="#">Нууцлал</a>
              <a href="#">🍪 Cookie</a>
              <a href="#">⚖ Шударга орон сууц</a>
              <a href="account.html#privacy" class="dns">🛡 Хувийн мэдээллийг бүү худалд →</a>
            </div>
          </div>

        </div>
      </footer>`;
  };

  // Listing card — clean, minimal (Zillow/Redfin-style)
  window.NEMI.listingCard = function(l) {
    const a = D.agentById(l.agent);
    const office = D.officeByName(a?.office);
    // Pick ONE primary photo badge by priority: hot > verified
    const primaryBadge = l.hot
      ? `<span class="badge badge-rose">${I.flame} Эрэлттэй</span>`
      : (l.verified ? `<span class="badge badge-green">${I.verified} Баталгаатай</span>` : '');
    return `
      <a href="listing.html?id=${l.id}" class="listing-card">
        <div class="listing-photo">
          <img src="${l.photo}" alt="${l.title}" loading="lazy" />
          <div class="photo-tags">${primaryBadge}</div>
          <button class="heart" onclick="event.preventDefault();event.stopPropagation();this.classList.toggle('active')">${I.heart}</button>
        </div>
        <div class="listing-body">
          <div class="flex items-center justify-between gap-2">
            <div class="listing-price">${D.shortMNT(l.price)}</div>
            <div class="ai-score-pill" title="AI чанарын оноо">★ ${l.aiScore}</div>
          </div>
          <div class="listing-title">${l.title}</div>
          <div class="listing-specs">
            ${l.rooms?`<span>${l.rooms} өрөө</span>`:''}
            <span>${l.area} м²</span>
            ${l.floor!=='-'?`<span>${l.floor}</span>`:''}
            <span>${l.district}</span>
          </div>
          <div class="listing-agent">
            <div class="avatar avatar-sm" style="background:${office?.color||'#C2410C'};color:#fff;display:grid;place-items:center;font-weight:700;font-size:10px">${a?.avatar||"NA"}</div>
            <div style="min-width:0;flex:1">
              <div class="agent-name">${a?.name||""}</div>
              <div class="agent-office">${a?.office||""}</div>
            </div>
            ${a?.verified?`<span class="badge badge-green" style="padding:2px 6px;font-size:10.5px">${I.verified}</span>`:''}
          </div>
        </div>
      </a>`;
  };
})();
