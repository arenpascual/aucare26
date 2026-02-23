// middleware/isArchiveStock.js
const Stocks = require('../model/stocks');

const isArchiveStock = async (req, res, next) => {
    try {
        const archivedStocks = await Stocks.find({ archive: true }).lean();
        res.locals.archivedStocks = archivedStocks;
        next();
    } catch (err) {
        console.error('Error in isArchiveStock middleware:', err.message);
        res.locals.archivedStocks = [];
        next();
    }
};

module.exports = isArchiveStock;
