const Users = require('../model/user');
const Log = require('../model/log');

const isLogs = async (req, res, next) => {
    try {
        // Kunin LAHAT ng logs (hindi archived), kahit sinong user o role ang gumawa
        const activityLogs = await Log.find({
            archive: false
        })
        .populate('who', 'fName lName role')
        .sort({ createdAt: -1 }) // Pinakabago muna
        .lean();

        // Attach sa res.locals para magamit sa EJS
        res.locals.allLogs = activityLogs;

        next();
    } catch (err) {
        console.error('Error in isLogs middleware:', err.message);
        res.locals.allLogs = [];
        next();
    }
};

module.exports = isLogs;