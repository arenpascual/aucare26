// middleware/isCampus.js
//
// GLOBAL CAMPUS SCOPE — walang binabago sa existing code.
// Binabalot nito ang res.render at res.json. Tumatakbo pa rin nang normal
// ang lahat ng existing middleware (isVisit, isRequest, isUsers, isAdmin,
// isArchive*, itsVisit, atbp.); bago lang mag-render, sinasala ang
// res.locals ayon sa campus ng naka-login na Admin / Sub Admin.
//
// MOUNT (app.js) — idagdag lang ito bago ang mga routes:
//
//   const isCampus = require('./middleware/isCampus');
//   app.use(isCampus);
//
// Ilagay ito PAGKATAPOS ng session + global res.locals middlewares mo,
// at BAGO ang unang app.get('/', ...).

const Users  = require('../model/user');
const Visits = require('../model/visit');

// Mga role lang na apektado. Super Admin at lahat ng iba = walang filter.
const SCOPED_ROLES = ['Admin', 'Sub Admin'];

// Exact spelling, tulad ng napagkasunduan.
const VALID_CAMPUS = ['South', 'San Jose', 'Main'];

// Mga route na LAGING exempt sa campus scope (dapat makita lahat).
const EXEMPT_PATHS = ['/x', '/vip-login'];
 
// Mga view name na laging exempt (kung iba ang path pero pareho ang view).
const EXEMPT_VIEWS = ['x'];
 

// Huwag hawakan ang mga key na ito kahit array pa sila.
const SKIP_KEYS = new Set([
  'user', 'messageSuccess', 'messagePass',
  'error', 'message', 'warning', 'success', 'denied'
]);

const norm = (val) => (typeof val === 'string' && val.trim() ? val.trim() : null);

/**
 * Hahanapin ang campus ng isang record:
 *   1. user/stock-style  -> item.campus
 *   2. visit-style       -> item.patient.campus   (kailangang populated)
 *   3. log/notif-style   -> item.who.campus       (kailangang populated)
 * Kapag wala sa tatlo, undefined -> hindi natin alam ang campus.
 */
function resolveCampus(item) {
  if (!item || typeof item !== 'object') return undefined;

  const own = norm(item.campus);
  if (own) return own;

  if (item.patient && typeof item.patient === 'object') {
    const c = norm(item.patient.campus);
    if (c) return c;
  }

  if (item.who && typeof item.who === 'object') {
    const c = norm(item.who.campus);
    if (c) return c;
  }

  return undefined;
}

/**
 * Sasala lang ang array kung may kahit isang item na may resolvable campus.
 * Kaya:
 *   - allVisits / allRequest / allUsers / allAdmins / pending accounts -> nafi-filter
 *   - stocks / logs / allergies / sariling visits ng user             -> hindi ginagalaw
 * Ang item na walang campus sa isang scopable array ay itinatago (required daw ang campus).
 */
function scopeArray(arr, campus) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;

  const scopable = arr.some(item => resolveCampus(item) !== undefined);
  if (!scopable) return arr;

  return arr.filter(item => resolveCampus(item) === campus);
}

function scopeContainer(obj, campus) {
  if (!obj || typeof obj !== 'object') return;

  for (const key of Object.keys(obj)) {
    if (SKIP_KEYS.has(key)) continue;
    const val = obj[key];
    if (Array.isArray(val)) obj[key] = scopeArray(val, campus);
  }
}

/** Kunin ang single visit object (galing itsVisit) kung meron. */
function pickSingleVisit(res, options) {
  const fromOpts = options && typeof options === 'object' ? options.v : null;
  return fromOpts || res.locals.v || null;
}

/** I-recompute ang sidebar badges para tugma sa nakikita. */
async function recountBadges(res, campus) {
  const needsRequest = res.locals.requestCount !== undefined;
  const needsPending = res.locals.pendingCount !== undefined;
  if (!needsRequest && !needsPending) return;

  if (needsRequest) {
    const campusUserIds = await Users.find({ campus }).distinct('_id');
    res.locals.requestCount = await Visits.countDocuments({
      archive: false,
      verify: true,
      status: 'Pending',
      patient: { $in: campusUserIds }
    });
  }

  if (needsPending) {
    res.locals.pendingCount = await Users.countDocuments({
      verify: true,
      archive: false,
      campus
    });
  }
}

const isCampus = (req, res, next) => {
  const sessionUser = req.session && req.session.user;

  // Hindi naka-login o hindi Admin / Sub Admin -> walang ginagawa.
  if (!sessionUser || !SCOPED_ROLES.includes(sessionUser.role)) return next();

  const campus = norm(sessionUser.campus);

  const originalRender = res.render.bind(res);
  const originalJson   = res.json.bind(res);
  let rendering = false;

  // ---- RENDER OVERRIDE ----
  res.render = function (view, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options  = undefined;
    }

    if (rendering) return originalRender(view, options, callback);
    rendering = true;

    (async () => {
      try {
        // Walang (o invalid na) campus ang admin -> walang ipapakitang record.
        if (!campus || !VALID_CAMPUS.includes(campus)) {
          req.session.error =
            'Your account has no valid campus assigned. Please contact the Super Admin.';
          scopeContainer(res.locals, '\u0000__no_campus__');
          if (options && typeof options === 'object') {
            scopeContainer(options, '\u0000__no_campus__');
          }
          res.locals.error = req.session.error;
          return originalRender(view, options, callback);
        }

        // Cross-campus visit detail (itsVisit) -> error message + redirect.
        const v = pickSingleVisit(res, options);
        if (v && v.patient && typeof v.patient === 'object') {
          const visitCampus = norm(v.patient.campus);
          if (visitCampus !== campus) {
            req.session.error =
              `Access denied. This record belongs to the ${visitCampus || 'unassigned'} campus.`;
            return req.session.save(() => res.redirect('/v2'));
          }
        }

        scopeContainer(res.locals, campus);
        if (options && typeof options === 'object') scopeContainer(options, campus);

        await recountBadges(res, campus);

        return originalRender(view, options, callback);
      } catch (err) {
        console.error('isCampus render error:', err.message);
        return originalRender(view, options, callback);
      }
    })();
  };

  // ---- JSON OVERRIDE (para sa AJAX/fetch endpoints) ----
  res.json = function (body) {
    try {
      if (campus && VALID_CAMPUS.includes(campus)) {
        if (Array.isArray(body)) {
          body = scopeArray(body, campus);
        } else if (body && typeof body === 'object') {
          scopeContainer(body, campus);
        }
      }
    } catch (err) {
      console.error('isCampus json error:', err.message);
    }
    return originalJson(body);
  };

  next();
};

module.exports = isCampus;
