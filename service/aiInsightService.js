// service/aiInsightService.js
const dayjs = require('dayjs');
const deepseek = require('../config/deepseek');
const Visits = require('../model/visit');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');
const Stocks = require('../model/stocks');
const Users = require('../model/user');

async function gatherClinicData() {
    // Visit trend by month (para sa Peak Period Warning)
    const monthlyVisits = await Visits.aggregate([
        { $match: { archive: false } },
        { $group: { _id: { $month: '$createdAt' }, total: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    // Top complaints (para sa Inventory Alert)
    const topComplaints = await Complaint.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    // Expiring stock within 30 days
    const expirationLimit = dayjs().add(30, 'day').toDate();
    const expiringStock = await Stocks.find({
        archive: false,
        expirationDate: { $gte: new Date(), $lte: expirationLimit }
    }).select('name remaining expirationDate type');

    // Low stock items
    const lowStock = await Stocks.find({
        archive: false,
        remaining: { $gt: 0, $lte: 10 }
    }).select('name remaining category');

    // Out of stock
    const outOfStock = await Stocks.find({
        archive: false,
        remaining: 0
    }).select('name category');

    // Most dispensed items (para sa Restock Recommendation)
    const topDispensed = await Dispense.aggregate([
        { $group: { _id: '$item', totalQty: { $sum: '$qty' } } },
        { $sort: { totalQty: -1 } },
        { $limit: 10 }
    ]);

    // Age group / role / gender breakdown (para sa demographic insights)
    const ageGroupBreakdown = await Users.aggregate([
        { $match: { archive: false } },
        { $group: { _id: '$yearLevel', count: { $sum: 1 } } }
    ]);

    const genderBreakdown = await Users.aggregate([
        { $match: { archive: false } },
        { $group: { _id: '$gender', count: { $sum: 1 } } }
    ]);

    const roleBreakdown = await Users.aggregate([
        { $match: { archive: false } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    return {
        monthlyVisits,
        topComplaints,
        expiringStock,
        lowStock,
        outOfStock,
        topDispensed,
        ageGroupBreakdown,
        genderBreakdown,
        roleBreakdown
    };
}

const SYSTEM_PROMPT = `You are AUCare's clinic analytics assistant.
Analyze the clinic data provided and generate actionable insights.

Rules:
- Only generate insights actually supported by the data given.
- Use concrete numbers (percentages, counts) from the data in the "message" field.
- Possible categories: peak_period_warning, inventory_alert, expiring_stock_alert,
  restock_recommendation, low_stock_warning, age_specific_focus, gender_based_planning,
  peak_demographic_engagement.
- Only include a category if the data justifies it. Skip categories with no strong signal.
- Return 2 to 4 insights max, the most important ones.
- Do NOT include patient names or identifying info, only aggregated data.

Output ONLY valid JSON, no markdown, no explanation, in this exact shape:
{
  "insights": [
    { "category": "string", "title": "string", "message": "string" }
  ]
}`;

async function generateInsights() {
    const clinicData = await gatherClinicData();

    const completion = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Clinic data:\n${JSON.stringify(clinicData)}` }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0].message.content;
    return JSON.parse(raw); // { insights: [...] }
}

module.exports = { generateInsights };