const Users = require('../model/user');
const Log = require('../model/log');

const isLogs = async (req, res, next) => {
    try {
        const allowedRoles = [
            'Student', 
            'Faculty', 
            'Staff', 
            'Security', 
            'Maintenance'
        ];

        // 1. Identify the active users we want to see logs for
        const activeUsers = await Users.find({
            archive: false,
            verify: false, 
            suspend: false,
            role: { $in: allowedRoles }
        }).select('_id').lean();

        const userIds = activeUsers.map(user => user._id);

        // 2. Fetch logs for these users that are not archived
        // We use .populate('who') to get the user's name/details inside the log
        const activityLogs = await Log.find({
            who: { $in: userIds },
            archive: false
        })
        .populate('who', 'fName lName role') 
        .sort({ createdAt: -1 }) // Show newest logs first
        .lean();

        // 3. Attach to res.locals for EJS
        res.locals.allLogs = activityLogs;

        next();
    } catch (err) {
        console.error('Error in isLogs middleware:', err.message);
        res.locals.allLogs = [];
        next();
    }
};

module.exports = isLogs;