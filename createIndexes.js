require('dotenv').config();

const mongoose = require('mongoose');

const Users = require('./model/user');
const Visits = require('./model/visit');
const Allergy = require('./model/allergy');
const Complaint = require('./model/complaint');
const Dispense = require('./model/dispense');
const Log = require('./model/log');
const Stocks = require('./model/stocks');

const INDEXES = [
    [Visits,    { patient: 1 },                                  'visits.patient'],
    [Visits,    { archive: 1, verify: 1, _id: -1 },              'visits.archive+verify'],
    [Users,     { archive: 1, verify: 1, suspend: 1, role: 1 },  'users.status+role'],
    [Users,     { campus: 1, role: 1 },                          'users.campus+role'],
    [Users,     { verify: 1, archive: 1, campus: 1 },            'users.pending'],
    [Allergy,   { who: 1 },                                      'allergy.who'],
    [Complaint, { visitId: 1 },                                  'complaint.visitId'],
    [Dispense,  { visitId: 1 },                                  'dispense.visitId'],
    [Log,       { archive: 1, createdAt: -1 },                   'log.archive+createdAt'],
    [Stocks,    { archive: 1, campus: 1 },                       'stocks.archive+campus']
];

async function run() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is missing. Check your .env file.');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    for (const [Model, keys, label] of INDEXES) {
        try {
            const name = await Model.collection.createIndex(keys);
            console.log(`OK   ${label} -> ${name}`);
        } catch (err) {
            console.warn(`SKIP ${label}: ${err.message}`);
        }
    }

    console.log('Done.');
}

run()
    .catch(error => {
        console.error('Failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });