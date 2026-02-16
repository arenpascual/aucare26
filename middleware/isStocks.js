const Stocks = require('../model/stocks');

const isStocks = async (req, res, next) => {
    try {
        // 1. Fetch all stock items that are not archived
        const allStocks = await Stocks.find({ archive: false }).lean();

        // 2. Filter based on your specific flow thresholds
        // Low Stock: exactly 10 or fewer (but more than 0)
        const lowStocks = allStocks.filter(item => item.remaining <= 10 && item.remaining > 0);
        
        // Out of Stock: exactly 0
        const outOfStocks = allStocks.filter(item => item.remaining === 0);

        // 3. Separate by type for EJS dropdowns
        const medicines = allStocks.filter(item => item.type === 'medicine');
        const supplies = allStocks.filter(item => item.type === 'supply');

        // 4. Attach to res.locals
        res.locals.stocks = allStocks;
        res.locals.lowStocks = lowStocks;
        res.locals.outOfStocks = outOfStocks;
        res.locals.medicines = medicines;
        res.locals.supplies = supplies;

        next();
    } catch (err) {
        console.error('Error in isStocks middleware:', err.message);
        res.locals.stocks = [];
        res.locals.lowStocks = [];
        res.locals.outOfStocks = [];
        res.locals.medicines = [];
        res.locals.supplies = [];
        next();
    }
};

module.exports = isStocks;