
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isoWeek = require('dayjs/plugin/isoWeek');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const Users = require('../model/user');
const Visits = require('../model/visit');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');
const Stocks = require('../model/stocks');
const Logs = require('../model/log');

const APP_TIMEZONE = 'Asia/Manila';

const SCOPED_ROLES = ['Admin', 'Sub Admin'];
const VALID_CAMPUS = ['Main', 'South', 'San Jose'];

// ============================================================
// DASHBOARD DATE RANGE
// ============================================================
function getDashboardDateRange(query) {
    const period = query.period || 'this_month';
    const now = dayjs().tz(APP_TIMEZONE);

    let start = null;
    let end = null;

    switch (period) {
        case 'today':
            start = now.startOf('day');
            end = now.endOf('day');
            break;

        case 'yesterday':
            start = now.subtract(1, 'day').startOf('day');
            end = now.subtract(1, 'day').endOf('day');
            break;

        case 'this_week':
            start = now.startOf('isoWeek');
            end = now.endOf('isoWeek');
            break;

        case 'last_week':
            start = now.subtract(1, 'week').startOf('isoWeek');
            end = now.subtract(1, 'week').endOf('isoWeek');
            break;

        case 'this_month':
            start = now.startOf('month');
            end = now.endOf('month');
            break;

        case 'last_month':
            start = now.subtract(1, 'month').startOf('month');
            end = now.subtract(1, 'month').endOf('month');
            break;

        case 'this_year':
            start = now.startOf('year');
            end = now.endOf('year');
            break;

        case 'last_year':
            start = now.subtract(1, 'year').startOf('year');
            end = now.subtract(1, 'year').endOf('year');
            break;

        case 'custom': {
            if (!query.startDate || !query.endDate) {
                throw new Error(
                    'Custom date range requires startDate and endDate.'
                );
            }

            start = dayjs.tz(query.startDate, APP_TIMEZONE).startOf('day');
            end = dayjs.tz(query.endDate, APP_TIMEZONE).endOf('day');

            if (!start.isValid() || !end.isValid()) {
                throw new Error('Invalid custom date range.');
            }

            if (start.isAfter(end)) {
                throw new Error(
                    'startDate cannot be later than endDate.'
                );
            }

            break;
        }

        case 'overall':
            return {
                period,
                start: null,
                end: null,
                startDate: null,
                endDate: null
            };

        default:
            throw new Error(`Invalid dashboard period: ${period}`);
    }

    return {
        period,
        start: start.toDate(),
        end: end.toDate(),
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD')
    };
}

// ============================================================
// CAMPUS-SCOPED DASHBOARD MIDDLEWARE
// ============================================================
async function isDashboardCampus(req, res, next) {
    const sessionUser = req.session?.user;

    // Super Admin and other roles use the original dashboard.
    if (
        !sessionUser ||
        !SCOPED_ROLES.includes(sessionUser.role)
    ) {
        return next();
    }

    // Only intercept the analytics endpoint.
    if (
        req.path !== '/api/dashboard/analytics' ||
        req.method !== 'GET'
    ) {
        return next();
    }

    const campus = sessionUser.campus?.trim();

    if (!campus || !VALID_CAMPUS.includes(campus)) {
        return res.status(403).json({
            success: false,
            message: 'Your account has no valid campus assigned. Please contact the Super Admin.'
        });
    }

    try {
        const query = req.query;

        const dateRange = getDashboardDateRange(query);

        const { start, end } = dateRange;

        const hasDateFilter = start !== null && end !== null;

        // ====================================================
        // COMMON FILTERS
        // ====================================================

        const userMatch = {
            archive: false,
            verify: false,
            suspend: false,
            campus
        };

        if (query.role && query.role !== 'all') {
            userMatch.role = query.role;
        }

        if (query.department && query.department !== 'all') {
            userMatch.department = query.department;
        }

        if (query.gender && query.gender !== 'all') {
            userMatch.gender = query.gender;
        }

        if (query.course && query.course !== 'all') {
            userMatch.course = query.course;
        }

        if (query.yearLevel && query.yearLevel !== 'all') {
            userMatch.yearLevel = query.yearLevel;
        }

        if (query.section && query.section !== 'all') {
            userMatch.section = query.section;
        }

        const visitMatch = {
            archive: false
        };

        if (hasDateFilter) {
            visitMatch.createdAt = {
                $gte: start,
                $lte: end
            };
        }

        if (query.visitStatus && query.visitStatus !== 'all') {
            visitMatch.status = query.visitStatus;
        }

        // ====================================================
        // COMMON VISIT LOOKUP
        // ====================================================

        const visitCampusPipeline = [
            { $match: visitMatch },

            {
                $lookup: {
                    from: Users.collection.name,
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patientData'
                }
            },

            { $unwind: '$patientData' },

            {
                $match: {
                    'patientData.archive': false,
                    'patientData.verify': false,
                    'patientData.suspend': false,
                    'patientData.campus': campus,

                    ...(query.role && query.role !== 'all'
                        ? { 'patientData.role': query.role }
                        : {}),

                    ...(query.department && query.department !== 'all'
                        ? { 'patientData.department': query.department }
                        : {}),

                    ...(query.gender && query.gender !== 'all'
                        ? { 'patientData.gender': query.gender }
                        : {}),

                    ...(query.course && query.course !== 'all'
                        ? { 'patientData.course': query.course }
                        : {}),

                    ...(query.yearLevel && query.yearLevel !== 'all'
                        ? { 'patientData.yearLevel': query.yearLevel }
                        : {}),

                    ...(query.section && query.section !== 'all'
                        ? { 'patientData.section': query.section }
                        : {})
                }
            }
        ];

        // ====================================================
        // 1. USER KPIs
        // ====================================================

        const [
            totalUsers,
            activeUsers,
            pendingUsers,
            suspendedUsers
        ] = await Promise.all([
            Users.countDocuments({
                archive: false,
                campus
            }),

            Users.countDocuments(userMatch),

            Users.countDocuments({
                archive: false,
                verify: true,
                campus
            }),

            Users.countDocuments({
                archive: false,
                suspend: true,
                campus
            })
        ]);

        // ====================================================
        // 2. VISIT KPIs
        // ====================================================

        const visitKpis = await Visits.aggregate([
            ...visitCampusPipeline,

            {
                $facet: {
                    totalVisits: [
                        { $count: 'count' }
                    ],

                    uniquePatients: [
                        { $group: { _id: '$patient' } },
                        { $count: 'count' }
                    ],

                    attended: [
                        { $match: { status: 'Attended' } },
                        { $count: 'count' }
                    ],

                    pending: [
                        { $match: { status: 'Pending' } },
                        { $count: 'count' }
                    ],

                    notAttended: [
                        { $match: { status: 'Not Attended' } },
                        { $count: 'count' }
                    ],

                    proceed: [
                        { $match: { status: 'Proceed' } },
                        { $count: 'count' }
                    ]
                }
            }
        ]);

        const stats = visitKpis[0] || {};

        const totalVisits = stats.totalVisits?.[0]?.count || 0;
        const uniquePatients = stats.uniquePatients?.[0]?.count || 0;
        const attended = stats.attended?.[0]?.count || 0;
        const pending = stats.pending?.[0]?.count || 0;
        const notAttended = stats.notAttended?.[0]?.count || 0;
        const proceed = stats.proceed?.[0]?.count || 0;

        const attendanceRate = totalVisits > 0
            ? Number((attended / totalVisits * 100).toFixed(2))
            : 0;

        const noShowRate = totalVisits > 0
            ? Number((notAttended / totalVisits * 100).toFixed(2))
            : 0;

        const pendingRate = totalVisits > 0
            ? Number((pending / totalVisits * 100).toFixed(2))
            : 0;

        // ====================================================
        // 3. TODAY'S VISITS
        // ====================================================

        const todayStart = dayjs()
            .tz(APP_TIMEZONE)
            .startOf('day')
            .toDate();

        const todayEnd = dayjs()
            .tz(APP_TIMEZONE)
            .endOf('day')
            .toDate();

        const todayVisits = await Visits.aggregate([
            {
                $match: {
                    archive: false,
                    createdAt: {
                        $gte: todayStart,
                        $lte: todayEnd
                    }
                }
            },

            {
                $lookup: {
                    from: Users.collection.name,
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patientData'
                }
            },

            { $unwind: '$patientData' },

            {
                $match: {
                    'patientData.archive': false,
                    'patientData.campus': campus
                }
            },

            { $count: 'count' }
        ]);

        const todayVisitCount = todayVisits[0]?.count || 0;

        // ====================================================
        // 4. VISIT TREND
        // ====================================================

        const visitTrend = await Visits.aggregate([
            ...visitCampusPipeline,

            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    },
                    visits: { $sum: 1 }
                }
            },

            {
                $sort: {
                    '_id.year': 1,
                    '_id.month': 1,
                    '_id.day': 1
                }
            }
        ]);

        // ====================================================
        // 5. VISITS BY ROLE
        // ====================================================

        const visitsByRole = await Visits.aggregate([
            ...visitCampusPipeline,

            {
                $group: {
                    _id: '$patientData.role',
                    count: { $sum: 1 }
                }
            },

            { $sort: { count: -1 } }
        ]);

        // ====================================================
        // 6. VISITS BY STATUS
        // ====================================================

        const visitsByStatus = await Visits.aggregate([
            ...visitCampusPipeline,

            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },

            { $sort: { count: -1 } }
        ]);

        const totalStatusCount = visitsByStatus.reduce(
            (sum, item) => sum + item.count,
            0
        );

        const visitsByStatusPercent = visitsByStatus.map(item => ({
            ...item,
            percentage: totalStatusCount > 0
                ? Number(
                    ((item.count / totalStatusCount) * 100).toFixed(2)
                )
                : 0
        }));

        // ====================================================
        // 7. TOP COMPLAINTS
        // ====================================================

        const complaintMatch = hasDateFilter
            ? {
                createdAt: {
                    $gte: start,
                    $lte: end
                }
            }
            : {};

        const topComplaints = await Complaint.aggregate([
            { $match: complaintMatch },

            {
                $lookup: {
                    from: Visits.collection.name,
                    localField: 'visitId',
                    foreignField: '_id',
                    as: 'visitData'
                }
            },

            { $unwind: '$visitData' },

            {
                $lookup: {
                    from: Users.collection.name,
                    localField: 'visitData.patient',
                    foreignField: '_id',
                    as: 'patientData'
                }
            },

            { $unwind: '$patientData' },

            {
                $match: {
                    'visitData.archive': false,
                    'patientData.archive': false,
                    'patientData.campus': campus,

                    ...(query.role && query.role !== 'all'
                        ? { 'patientData.role': query.role }
                        : {}),

                    ...(query.department && query.department !== 'all'
                        ? { 'patientData.department': query.department }
                        : {}),

                    ...(query.gender && query.gender !== 'all'
                        ? { 'patientData.gender': query.gender }
                        : {})
                }
            },

            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            },

            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // ====================================================
        // 8. DISPENSE ANALYTICS
        // ====================================================

        const dispenseMatch = hasDateFilter
            ? {
                createdAt: {
                    $gte: start,
                    $lte: end
                }
            }
            : {};

        const dispensing = await Dispense.aggregate([
            { $match: dispenseMatch },

            {
                $lookup: {
                    from: Visits.collection.name,
                    localField: 'visitId',
                    foreignField: '_id',
                    as: 'visitData'
                }
            },

            { $unwind: '$visitData' },

            {
                $lookup: {
                    from: Users.collection.name,
                    localField: 'visitData.patient',
                    foreignField: '_id',
                    as: 'patientData'
                }
            },

            { $unwind: '$patientData' },

            {
                $match: {
                    'visitData.archive': false,
                    'patientData.archive': false,
                    'patientData.campus': campus,

                    ...(query.role && query.role !== 'all'
                        ? { 'patientData.role': query.role }
                        : {}),

                    ...(query.department && query.department !== 'all'
                        ? { 'patientData.department': query.department }
                        : {}),

                    ...(query.gender && query.gender !== 'all'
                        ? { 'patientData.gender': query.gender }
                        : {})
                }
            },

            {
                $facet: {
                    byType: [
                        {
                            $group: {
                                _id: '$type',
                                quantity: { $sum: '$qty' },
                                transactions: { $sum: 1 }
                            }
                        }
                    ],

                    topItems: [
                        {
                            $group: {
                                _id: '$item',
                                quantity: { $sum: '$qty' }
                            }
                        },

                        { $sort: { quantity: -1 } },
                        { $limit: 10 }
                    ]
                }
            }
        ]);

        const dispensingStats = dispensing[0] || {};

        // ====================================================
        // 9. INVENTORY
        // ====================================================

        const inventory = await Stocks.aggregate([
            {
                $match: {
                    archive: false,
                    campus
                }
            },

            {
                $facet: {
                    total: [
                        { $count: 'count' }
                    ],

                    medicines: [
                        { $match: { type: 'medicine' } },
                        { $count: 'count' }
                    ],

                    supplies: [
                        { $match: { type: 'supply' } },
                        { $count: 'count' }
                    ],

                    lowStock: [
                        {
                            $match: {
                                remaining: {
                                    $gt: 0,
                                    $lte: 10
                                }
                            }
                        },
                        { $count: 'count' }
                    ],

                    outOfStock: [
                        { $match: { remaining: 0 } },
                        { $count: 'count' }
                    ],

                    expired: [
                        {
                            $match: {
                                expirationDate: {
                                    $ne: null,
                                    $lt: new Date()
                                }
                            }
                        },
                        { $count: 'count' }
                    ]
                }
            }
        ]);

        const inventoryData = inventory[0] || {};

        const totalInventory = inventoryData.total?.[0]?.count || 0;
        const lowStockCount = inventoryData.lowStock?.[0]?.count || 0;
        const outOfStockCount = inventoryData.outOfStock?.[0]?.count || 0;
        const expiredCount = inventoryData.expired?.[0]?.count || 0;

        const healthyInventory = Math.max(
            totalInventory -
            lowStockCount -
            outOfStockCount -
            expiredCount,
            0
        );

        const inventoryHealth = totalInventory > 0
            ? Number(
                ((healthyInventory / totalInventory) * 100).toFixed(2)
            )
            : 0;

        // ====================================================
        // 10. EXPIRING SOON
        // ====================================================

        const expirationLimit = dayjs()
            .tz(APP_TIMEZONE)
            .add(30, 'day')
            .endOf('day')
            .toDate();

        const expiringSoon = await Stocks.countDocuments({
            archive: false,
            campus,
            expirationDate: {
                $gte: new Date(),
                $lte: expirationLimit
            }
        });

        // ====================================================
        // 11. RECENT ACTIVITY
        // ====================================================

        const recentActivity = await Logs.aggregate([
            {
                $match: {
                    archive: false
                }
            },

            {
                $lookup: {
                    from: Users.collection.name,
                    localField: 'who',
                    foreignField: '_id',
                    as: 'whoData'
                }
            },

            { $unwind: '$whoData' },

            {
                $match: {
                    'whoData.campus': campus
                }
            },

            {
                $sort: {
                    createdAt: -1
                }
            },

            { $limit: 10 },

            {
                $project: {
                    who: {
                        _id: '$whoData._id',
                        fName: '$whoData.fName',
                        lName: '$whoData.lName',
                        username: '$whoData.username',
                        role: '$whoData.role'
                    },
                    what: 1,
                    archive: 1,
                    createdAt: 1,
                    updatedAt: 1
                }
            }
        ]);

        // ====================================================
        // 12. RESPONSE
        // Same structure as your original dashboard API
        // ====================================================

        return res.status(200).json({
            success: true,

            filters: {
                period: dateRange.period,
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,

                role: query.role || 'all',
                department: query.department || 'all',
                campus,
                gender: query.gender || 'all',
                visitStatus: query.visitStatus || 'all'
            },

            kpis: {
                totalUsers,
                activeUsers,
                pendingUsers,
                suspendedUsers,

                totalVisits,
                todayVisits: todayVisitCount,
                uniquePatients,
                attended,
                pending,
                notAttended,
                proceed,

                attendanceRate,
                noShowRate,
                pendingRate,

                totalInventory,
                lowStockCount,
                outOfStockCount,
                expiredCount,
                expiringSoon,
                inventoryHealth
            },

            charts: {
                visitTrend,
                visitsByRole,
                visitsByStatus: visitsByStatusPercent,
                topComplaints,

                dispensingByType:
                    dispensingStats.byType || [],

                topDispensedItems:
                    dispensingStats.topItems || []
            },

            recentActivity
        });

    } catch (error) {
        console.error(
            'Dashboard Campus Analytics Error:',
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message ||
                'Failed to load campus dashboard analytics.'
        });
    }
}

module.exports = isDashboardCampus;