// service/aiInsightService.js
const dayjs = require('dayjs');
const deepseek = require('../config/deepseek');
const Visits = require('../model/visit');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');
const Stocks = require('../model/stocks');
const Users = require('../model/user');

const APP_TIMEZONE = 'Asia/Manila';

async function gatherClinicData({
    patientIds = [],
    start = null,
    end = null,
    hasDateFilter = false,
    visitStatus = 'all',
    campus = null,
    focusStock = false
}) {
    // Parehong visit filter ng dashboard analytics
    const visitMatch = {
        patient: { $in: patientIds },
        $or: [{ archive: false }, { status: 'Not Attended' }]
    };
    if (hasDateFilter) visitMatch.createdAt = { $gte: start, $lte: end };
    if (visitStatus && visitStatus !== 'all') visitMatch.status = visitStatus;

    const visitIds = await Visits.find(visitMatch).distinct('_id');

    // Stocks: sakop ang campus. Kapag may role/department/gender/status filter,
    // gamot lang na na-dispense sa filtered na grupo ang isasama.
    let stockNameFilter = {};
    if (focusStock) {
        const dispensedNames = await Dispense.distinct('item', { visitId: { $in: visitIds } });
        stockNameFilter = { name: { $in: dispensedNames } };
    }

    const stockMatch = {
        archive: false,
        ...(campus ? { campus } : {}),
        ...stockNameFilter
    };
    const expirationLimit = dayjs().add(30, 'day').toDate();

    const [
        monthlyVisits,
        visitsByPatient,
        topComplaints,
        topDispensed,
        expiringStock,
        lowStock,
        outOfStock,
        patients
    ] = await Promise.all([
        // Visit trend by month
        Visits.aggregate([
            { $match: visitMatch },
            {
                $group: {
                    _id: {
                        year: { $year: { date: '$createdAt', timezone: APP_TIMEZONE } },
                        month: { $month: { date: '$createdAt', timezone: APP_TIMEZONE } }
                    },
                    total: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]),

        // Visits per patient (para sa demographic breakdown)
        Visits.aggregate([
            { $match: visitMatch },
            { $group: { _id: '$patient', count: { $sum: 1 } } }
        ]),

        // Top complaints (ng mga visit na pasok sa filter)
        Complaint.aggregate([
            { $match: { visitId: { $in: visitIds } } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]),

        // Most dispensed items (ng mga visit na pasok sa filter)
        Dispense.aggregate([
            { $match: { visitId: { $in: visitIds } } },
            { $group: { _id: '$item', totalQty: { $sum: '$qty' } } },
            { $sort: { totalQty: -1 } },
            { $limit: 10 }
        ]),

        Stocks.find({
            ...stockMatch,
            expirationDate: { $gte: new Date(), $lte: expirationLimit }
        }).select('name remaining expirationDate type campus').limit(25).lean(),

        Stocks.find({
            ...stockMatch,
            remaining: { $gt: 0, $lte: 10 }
        }).select('name remaining category campus').limit(25).lean(),

        Stocks.find({
            ...stockMatch,
            remaining: 0
        }).select('name category campus').limit(25).lean(),

        Users.find({ _id: { $in: patientIds } })
            .select('role gender yearLevel campus')
            .lean()
    ]);

    // Demographic breakdown ng VISITS (hindi ng lahat ng users)
    const patientById = new Map(patients.map(p => [String(p._id), p]));
    const tally = { role: {}, gender: {}, yearLevel: {}, campus: {} };
    let totalVisits = 0;

    const add = (bucket, key, n) => {
        const k = key || 'Unknown';
        bucket[k] = (bucket[k] || 0) + n;
    };

    for (const row of visitsByPatient) {
        totalVisits += row.count;
        const p = patientById.get(String(row._id));
        if (!p) continue;
        add(tally.role, p.role, row.count);
        add(tally.gender, p.gender, row.count);
        add(tally.yearLevel, p.yearLevel || 'N/A', row.count);
        add(tally.campus, p.campus, row.count);
    }

    const toList = obj =>
        Object.entries(obj)
            .map(([_id, count]) => ({ _id, count }))
            .sort((a, b) => b.count - a.count);

    const data = {
        totalVisits,
        uniquePatients: visitsByPatient.length,
        inventoryScope: focusStock
            ? 'Only items that were dispensed to the filtered patient group'
            : 'All items in the selected campus scope',
        monthlyVisits,
        topComplaints,
        expiringStock,
        lowStock,
        outOfStock,
        topDispensed,
        ageGroupBreakdown: toList(tally.yearLevel),
        genderBreakdown: toList(tally.gender),
        roleBreakdown: toList(tally.role)
    };

    // Kapag walang campus filter (Super Admin, All Campuses), isama ang per-campus breakdown
    if (!campus) {
        data.visitsByCampus = toList(tally.campus);
    }

    return data;
}

const SYSTEM_PROMPT = `You are AUCare's clinic analytics assistant.
Analyze the clinic data provided and generate actionable insights.

Rules:
- The data has ALREADY been filtered. The "Filters applied" line tells you the exact scope
  (period, campus, role, department, gender, visit status). Base every insight ONLY on this
  filtered data and never mention or assume data outside that scope.
- Every insight must be about the filtered group itself. Name the group in the message
  (for example "Among CIT students at South campus, ..."). Do not give generic clinic-wide advice.
- The "inventoryScope" field says which stock items are included. When it says only items
  dispensed to the filtered group, frame inventory insights as what that group depends on.
- Only generate insights actually supported by the data given.
- Use concrete numbers (percentages, counts) from the data in the "message" field.
- If "visitsByCampus" is present, the data covers multiple campuses: state which campus
  (South, San Jose, or Main) each insight is about whenever it is relevant.
- Possible categories: peak_period_warning, inventory_alert, expiring_stock_alert,
  restock_recommendation, low_stock_warning, age_specific_focus, gender_based_planning,
  peak_demographic_engagement.
- Only include a category if the data justifies it. Skip categories with no strong signal.
- If totalVisits is 0, do not invent visit-related insights.
- Return 2 to 4 insights max, the most important ones.
- Do NOT include patient names or identifying info, only aggregated data.

Output ONLY valid JSON, no markdown, no explanation, in this exact shape:
{
  "insights": [
    { "category": "string", "title": "string", "message": "string" }
  ]
}`;

async function generateInsights(options = {}) {
    const filterLabel = options.filterLabel || 'No filters (all data)';
    const clinicData = await gatherClinicData(options);

    const completion = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: `Filters applied: ${filterLabel}\n\nClinic data:\n${JSON.stringify(clinicData)}`
            }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0].message.content;
    return JSON.parse(raw); // { insights: [...] }
}

module.exports = { generateInsights };