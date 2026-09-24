// middleware/isStocks.js
const Stocks = require('../model/stocks');

const VALID_CAMPUS = ['Main', 'South', 'San Jose'];

const isStocks = async (req, res, next) => {
    try {
        const user = req.session.user;

        if (!user) {
            res.locals.stocks = [];
            res.locals.lowStocks = [];
            res.locals.inStocks = [];
            res.locals.outOfStocks = [];
            res.locals.medicines = [];
            res.locals.supplies = [];
            res.locals.selectedCampus = null;
            res.locals.isSuperAdmin = false;

            return next();
        }

        const isSuperAdmin = user.role === 'Super Admin';

        let selectedCampus;

        // ============================================================
        // SUPER ADMIN
        // Can switch between Main, South, and San Jose
        // ============================================================
        if (isSuperAdmin) {

            const requestedCampus = req.query.campus;

            if (VALID_CAMPUS.includes(requestedCampus)) {
                selectedCampus = requestedCampus;
            } else {
                selectedCampus = 'Main';
            }

        // ============================================================
        // OTHER USERS
        // Locked to their own campus
        // ============================================================
        } else {

            if (VALID_CAMPUS.includes(user.campus)) {
                selectedCampus = user.campus;
            } else {
                selectedCampus = null;
            }
        }

        res.locals.isSuperAdmin = isSuperAdmin;
        res.locals.selectedCampus = selectedCampus;

        // ============================================================
        // STOCK FILTER
        // Always exclude archived stocks
        // Then filter by selected campus
        // ============================================================
        const filter = {
            archive: false
        };

        if (selectedCampus) {
            filter.campus = selectedCampus;
        }

        console.log('======================================');
        console.log('STOCK CAMPUS FILTER');
        console.log('User:', user.username);
        console.log('Role:', user.role);
        console.log('User Campus:', user.campus);
        console.log('Query Campus:', req.query.campus);
        console.log('Selected Campus:', selectedCampus);
        console.log('Mongo Filter:', filter);
        console.log('======================================');

        const allStocks = await Stocks.find(filter)
            .sort({ name: 1 })
            .lean();

        console.log(
            `isStocks found ${allStocks.length} stock(s) for campus: ${selectedCampus}`
        );

        // ============================================================
        // STOCK CATEGORIES
        // ============================================================

        const inStocks = allStocks.filter(
            item => Number(item.remaining) > 10
        );

        const lowStocks = allStocks.filter(
            item =>
                Number(item.remaining) > 0 &&
                Number(item.remaining) <= 10
        );

        const outOfStocks = allStocks.filter(
            item => Number(item.remaining) === 0
        );

        const medicines = allStocks.filter(
            item => item.type === 'medicine'
        );

        const supplies = allStocks.filter(
            item => item.type === 'supply'
        );

        // ============================================================
        // SEND TO EJS
        // ============================================================

        res.locals.stocks = allStocks;
        res.locals.inStocks = inStocks;
        res.locals.lowStocks = lowStocks;
        res.locals.outOfStocks = outOfStocks;
        res.locals.medicines = medicines;
        res.locals.supplies = supplies;

        next();

    } catch (err) {

        console.error('Error in isStocks middleware:', err);

        res.locals.stocks = [];
        res.locals.inStocks = [];
        res.locals.lowStocks = [];
        res.locals.outOfStocks = [];
        res.locals.medicines = [];
        res.locals.supplies = [];
        res.locals.selectedCampus = null;
        res.locals.isSuperAdmin = false;

        next();
    }
};

module.exports = isStocks;