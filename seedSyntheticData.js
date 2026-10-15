require('dotenv').config();

const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const Users = require('./model/user');
const Visits = require('./model/visit');

const MANIFEST_PATH = path.join(__dirname, 'seed-manifest.json');

const CAMPUSES = [
    { name: 'Main' },
    { name: 'South' },
    { name: 'San Jose' }
];

// TARGET ACCOUNTS PER CAMPUS
const CAMPUS_TARGETS = {
    Main: 2756,
    South: 1648,
    'San Jose': 2034
};

const MIN_VISITS = 3;
const MAX_VISITS = 5;
const START_DATE = new Date('2024-01-01T00:00:00.000Z');

const ENROLLMENT_YEARS = [
    '2223',
    '2324',
    '2425',
    '2526',
    '2627'
];

const FIRST_NAMES = [
    'Juan', 'Maria', 'Jose', 'Ana', 'Mark', 'Jess', 'John',
    'Angela', 'Christian', 'Patricia', 'Joshua', 'Nicole',
    'Daniel', 'Samantha', 'Gabriel', 'Andrea', 'Michael',
    'Christine', 'Carlo', 'Michelle', 'Adrian', 'Camille',
    'Francis', 'Jasmine', 'Nathan', 'Bianca', 'Kevin',
    'Isabella', 'Rafael', 'Denise', 'Paolo', 'Trisha',
    'Lorenzo', 'Katherine', 'Miguel', 'Alyssa', 'Vincent',
    'Clarisse', 'Jerome', 'Beatrice', 'Enrique', 'Danica',
    'Patrick', 'Erika', 'Stephen', 'Mikaela', 'Anthony',
    'Kristine', 'Gabrielle', 'Dominic', 'Reymond', 'Janine',
    'Aira', 'Aileen', 'Aimee', 'Althea', 'Amara',
    'Andrea', 'Angelica', 'Annika', 'April', 'Arielle',
    'Ashley', 'Audrey', 'Bea', 'Bernadette', 'Carmela',
    'Carmina', 'Cassandra', 'Catherine', 'Charmaine', 'Cheska',
    'Christine', 'Daisy', 'Daphne', 'Darlene', 'Diana',
    'Elaine', 'Eliza', 'Ella', 'Eloisa', 'Emmanuel',
    'Erwin', 'Faith', 'Felix', 'Frances', 'Franco',
    'Gian', 'Gilbert', 'Glenda', 'Grace', 'Hannah',
    'Hazel', 'Ian', 'Irene', 'Janelle', 'Janine',
    'Jasmine', 'Jayson', 'Jessa', 'Joanna', 'Jocelyn',
    'Joel', 'Jonas', 'Josephine', 'Joy', 'Juliana',
    'Karen', 'Karl', 'Kristel', 'Kyle', 'Lara',
    'Leah', 'Leandro', 'Leslie', 'Liza', 'Louise',
    'Lucia', 'Mae', 'Manuel', 'Marc', 'Maricel',
    'Mariel', 'Marina', 'Marvin', 'Matteo', 'Maxine',
    'Melanie', 'Melissa', 'Mia', 'Monica', 'Nadine',
    'Nathalie', 'Neil', 'Nina', 'Noel', 'Olivia',
    'Paula', 'Pauline', 'Pearl', 'Ramon', 'Rhea',
    'Rica', 'Rina', 'Rizalyn', 'Robert', 'Rochelle',
    'Rogelio', 'Ronald', 'Rose', 'Rowena', 'Ruby',
    'Ryan', 'Samuel', 'Sandra', 'Sheila', 'Sheryl',
    'Sophia', 'Stella', 'Therese', 'Timothy', 'Tristan',
    'Vanessa', 'Veronica', 'Victor', 'Wilfred', 'Yvonne',
    'Zachary', 'Alvin', 'Arvin', 'Bryan', 'Cedric',
    'Daryl', 'Darren', 'Edgar', 'Elijah', 'Ethan',
    'Harold', 'James', 'Jasper', 'Jeremy', 'Julius',
    'Lance', 'Martin', 'Nathaniel', 'Oliver', 'Philip',
    'Richard', 'Sean', 'Simon', 'Theodore', 'Vincent'
];

const MIDDLE_NAMES = [
    'Delacruz', 'Santos', 'Reyes', 'Garcia', 'Mendoza',
    'Bautista', 'Villanueva', 'Fernandez', 'Gonzales',
    'Ramos', 'Aquino', 'Castillo', 'Rivera', 'Flores',
    'Mercado', 'Torres', 'Navarro', 'Morales', 'Cruz',
    'DelaRosa', 'Manalo', 'Soriano', 'Pascual', 'Aguilar',
    'Salazar', 'Domingo', 'Valdez', 'Castro', 'Padilla',
    'Santiago', 'Tolentino', 'Francisco', 'Lim', 'Tan',
    'David', 'Luna', 'Estrada', 'Ocampo', 'Dizon',
    'Macaraeg', 'Abad', 'Alvarez', 'Robles', 'Pineda',
    'Samson', 'Andrada', 'Bernardo', 'Marquez', 'Salvador',
    'Alcantara', 'Arellano', 'Barrios', 'Beltran', 'Benitez',
    'Buenaventura', 'Caballero', 'Cabrera', 'Calderon',
    'Camacho', 'Campos', 'Canlas', 'Carandang', 'Carpio',
    'Casimiro', 'Castañeda', 'Cayanan', 'Chua', 'Co',
    'Corpuz', 'Cortez', 'De Guzman', 'De Leon', 'De Vera',
    'Del Rosario', 'Delos Santos', 'Diaz', 'Enriquez',
    'Escobar', 'Espiritu', 'Evangelista', 'Fajardo',
    'Ferrer', 'Francisco', 'Galang', 'Gatdula', 'Guevarra',
    'Hilario', 'Ignacio', 'Jacinto', 'Javier', 'Labrador',
    'Lazaro', 'Legaspi', 'Lorenzo', 'Macalino', 'Magbanua',
    'Malabanan', 'Mallari', 'Manansala', 'Mangahas',
    'Mariano', 'Maturan', 'Miranda', 'Montes', 'Natividad',
    'Nepomuceno', 'Ong', 'Panganiban', 'Pascua', 'Pelaez',
    'Peña', 'Quizon', 'Razon', 'Regalado', 'Roldan',
    'Rosales', 'Sarmiento', 'Sevilla', 'Sison', 'Soriano',
    'Suarez', 'Tamayo', 'Tanjutco', 'Tiongson', 'Uy',
    'Vergara', 'Yap', 'Yumul', 'Zamora'
];

const LAST_NAMES = [
    'Abad', 'Aguilar', 'Alcantara', 'Alvarez', 'Andrada',
    'Aquino', 'Arellano', 'Bautista', 'Bernardo', 'Castillo',
    'Castro', 'Cruz', 'David', 'DelaCruz', 'DelaRosa',
    'DelosReyes', 'Domingo', 'Dizon', 'Enriquez', 'Estrada',
    'Evangelista', 'Fernandez', 'Flores', 'Garcia', 'Gomez',
    'Gonzales', 'Gutierrez', 'Hernandez', 'Jimenez', 'Lacson',
    'Lim', 'Lopez', 'Luna', 'Macaraeg', 'Manalo',
    'Marquez', 'Martinez', 'Medina', 'Mendoza', 'Mercado',
    'Miranda', 'Morales', 'Navarro', 'Ocampo', 'Ortega',
    'Padilla', 'Pascual', 'Perez', 'Pineda', 'Ramos',
    'Reyes', 'Rivera', 'Robles', 'Rodriguez', 'Rojas',
    'Salazar', 'Salvador', 'Samson', 'Sanchez', 'Santiago',
    'Santos', 'Soriano', 'Suarez', 'Tan', 'Torres',
    'Valdez', 'Vargas', 'Velasco', 'Villanueva', 'Zamora',
    'Agustin', 'Alonzo', 'Amador', 'Angeles', 'Arceo',
    'Arriola', 'Bacani', 'Balagtas', 'Baluyot', 'Banaag',
    'Barrera', 'Bartolome', 'Basilio', 'Belen', 'Benitez',
    'Bonifacio', 'Borja', 'Briones', 'Buenaventura', 'Cabral',
    'Calma', 'Calub', 'Capili', 'Carpio', 'Carreon',
    'Casas', 'Catapang', 'Cayanan', 'Cayabyab', 'Clemente',
    'Concepcion', 'Corpuz', 'Cortez', 'Cuenca', 'Damasco',
    'De Guzman', 'De Jesus', 'De Leon', 'De Vera', 'Del Rosario',
    'Delos Santos', 'Dela Peña', 'Dela Torre', 'Dimaculangan',
    'Dumlao', 'Espino', 'Fajardo', 'Francisco', 'Galang',
    'Gamboa', 'Gatdula', 'Guevarra', 'Hidalgo', 'Hilario',
    'Ignacio', 'Jacinto', 'Javier', 'Labrador', 'Lacap',
    'Lansangan', 'Lazaro', 'Legaspi', 'Lorenzo', 'Macalino',
    'Magbanua', 'Malabanan', 'Mallari', 'Manansala', 'Mangubat',
    'Mariano', 'Maturan', 'Natividad', 'Nepomuceno', 'Ong',
    'Panganiban', 'Pascua', 'Pelaez', 'Peña', 'Quizon',
    'Razon', 'Regalado', 'Roldan', 'Rosales', 'Sarmiento',
    'Sevilla', 'Sison', 'Tamayo', 'Tiongson', 'Uy',
    'Vergara', 'Yap', 'Yumul'
];

const COURSES = [
    { name: 'Bachelor of Arts in Political Science', department: 'CMA' },
    { name: 'Bachelor of Early Childhood Education', department: 'CELA' },
    { name: 'Bachelor of Elementary Education', department: 'CELA' },
    { name: 'Bachelor of Science in Accountancy', department: 'CMA' },
    { name: 'Bachelor of Science in Accounting Information System', department: 'CMA' },
    { name: 'Bachelor of Science in Business Administration - Banking and Microfinance', department: 'CMA' },
    { name: 'Bachelor of Science in Business Administration - Financial Management', department: 'CMA' },
    { name: 'Bachelor of Science in Business Administration - Human Resource Management', department: 'CMA' },
    { name: 'Bachelor of Science in Business Administration - Marketing Management', department: 'CMA' },
    { name: 'Bachelor of Science in Civil Engineering', department: 'COE' },
    { name: 'Bachelor of Science in Criminology', department: 'CCJE' },
    { name: 'Bachelor of Science in Electrical Engineering', department: 'COE' },
    { name: 'Bachelor of Science in Entrepreneurship', department: 'CMA' },
    { name: 'Bachelor of Science in Hospitality Management', department: 'CMA' },
    { name: 'Bachelor of Science in Information Technology', department: 'CIT' },
    { name: 'Bachelor of Science in Management Accounting', department: 'CMA' },
    { name: 'Bachelor of Science in Medical Laboratory Science', department: 'CAHS' },
    { name: 'Bachelor of Science in Nursing', department: 'CAHS' },
    { name: 'Bachelor of Science in Pharmacy', department: 'CAHS' },
    { name: 'Bachelor of Science in Psychology', department: 'CAHS' },
    { name: 'Bachelor of Secondary Education - English', department: 'CELA' },
    { name: 'Bachelor of Secondary Education - Filipino', department: 'CELA' },
    { name: 'Bachelor of Secondary Education - Mathematics', department: 'CELA' },
    { name: 'Bachelor of Secondary Education - Science', department: 'CELA' },
    { name: 'ABM', department: 'CELA' },
    { name: 'GAS', department: 'CELA' },
    { name: 'HUMSS', department: 'CELA' },
    { name: 'STEM', department: 'CELA' }
];

const COMPLAINTS = [
    'Allergy',
    'Body/Muscle Pain',
    'Colds',
    'Cough',
    'Difficulty of Breathing',
    'Dizziness',
    'Dysmenorrhea/Menstrual Cramps',
    'Fever',
    'Headache',
    'Hyperacidity',
    'LBM',
    'Toothache',
    'Abdominal Pain/Cramps'
];

const CONCERNS = [
    'Rest/Observation',
    'Health Concern / Request Medicines',
    'Health Consultation'
];

const TREATMENTS = [
    'Rest and observation',
    'Advised to drink water and rest',
    'Vital signs monitored',
    'Provided basic clinic assistance',
    'Advised to seek further medical consultation'
];

// 95% Nueva Ecija; 5% outside Nueva Ecija.
const NUEVA_ECIJA_ADDRESSES = [
    'Cabanatuan City, Nueva Ecija',
    'San Jose City, Nueva Ecija',
    'Gapan City, Nueva Ecija',
    'Talavera, Nueva Ecija',
    'Palayan City, Nueva Ecija',
    'Jaen, Nueva Ecija',
    'Zaragoza, Nueva Ecija',
    'Aliaga, Nueva Ecija',
    'Santa Rosa, Nueva Ecija',
    'General Tinio, Nueva Ecija',
    'Bongabon, Nueva Ecija',
    'Guimba, Nueva Ecija',
    'Licab, Nueva Ecija',
    'Lupao, Nueva Ecija',
    'Science City of Muñoz, Nueva Ecija',
    'Quezon, Nueva Ecija',
    'Laur, Nueva Ecija',
    'Nampicuan, Nueva Ecija',
    'Pantabangan, Nueva Ecija',
    'Peñaranda, Nueva Ecija',
    'San Antonio, Nueva Ecija',
    'San Isidro, Nueva Ecija',
    'San Leonardo, Nueva Ecija',
    'Talugtug, Nueva Ecija',
    'Cuyapo, Nueva Ecija',
    'Carranglan, Nueva Ecija',
    'Gabaldon, Nueva Ecija',
    'Cabiao, Nueva Ecija',
    'Gen. Mamerto Natividad, Nueva Ecija'
];

const OUTSIDE_NUEVA_ECIJA_ADDRESSES = [
    'Tarlac City, Tarlac',
    'Concepcion, Tarlac',
    'San Fernando City, Pampanga',
    'Angeles City, Pampanga',
    'Baliwag, Bulacan',
    'Malolos City, Bulacan',
    'Baler, Aurora',
    'Quezon City, Metro Manila',
    'Manila, Metro Manila',
    'Olongapo City, Zambales'
];


const GENDERS = ['Male', 'Female'];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
    return items[randomInt(0, items.length - 1)];
}

// ADDED: 95% Nueva Ecija; 5% outside Nueva Ecija.
function pickUserAddress() {
    return Math.random() < 0.95
        ? pick(NUEVA_ECIJA_ADDRESSES)
        : pick(OUTSIDE_NUEVA_ECIJA_ADDRESSES);
}

function shuffle(items) {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i--) {
        const j = randomInt(0, i);
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

function randomDate(start, end) {
    return new Date(
        start.getTime() +
        Math.floor(Math.random() * (end.getTime() - start.getTime() + 1))
    );
}

function normalize(value) {
    return String(value || '').trim().toLowerCase();
}

function fullNameKey(first, middle, last) {
    return [
        normalize(first),
        normalize(middle),
        normalize(last)
    ].join('|');
}

function makeEmail(first, middle, last) {
    const clean = value => value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z]/g, '')
        .toLowerCase();

    return `${clean(first).slice(0, 2)}${clean(middle).slice(0, 2)}.${clean(last)}.au@phinmaed.com`;
}

function makeSchoolId(enrollmentYear, sequence, usedSchoolIds) {
    let number = sequence;

    while (true) {
        const id = `01-${enrollmentYear}-${String(number).padStart(6, '0')}`;

        if (!usedSchoolIds.has(normalize(id))) {
            usedSchoolIds.add(normalize(id));
            return id;
        }

        number++;
    }
}

function getYearLevel(enrollmentYear) {
    switch (enrollmentYear) {
        case '2223':
            return pick(['Third Year', 'Fourth Year']);

        case '2324':
            return pick(['Third Year', 'Fourth Year']);

        case '2425':
            return pick(['Second Year', 'Third Year']);

        case '2526':
            return pick(['First Year', 'Second Year']);

        case '2627':
            return 'First Year';

        default:
            return pick([
                'First Year',
                'Second Year',
                'Third Year',
                'Fourth Year'
            ]);
    }
}

function randomPhone() {
    return `09${randomInt(10, 99)}${String(
        randomInt(0, 99999999)
    ).padStart(8, '0')}`;
}

function randomBirthDate() {
    const bYear = randomInt(2000, 2007);
    const bMonth = randomInt(1, 12);
    const bDay = randomInt(1, new Date(bYear, bMonth, 0).getDate());

    return { bDay, bMonth, bYear };
}

function makeStudent(first, middle, last, campus, schoolId, enrollmentYear, ) {
    const email = makeEmail(first, middle, last);
    const birth = randomBirthDate();
    const course = pick(COURSES);
    const emergencyFirst = pick(FIRST_NAMES);
    const emergencyLast = pick(LAST_NAMES);

    return {
        _id: new mongoose.Types.ObjectId(),

        fName: first,
        mName: middle,
        lName: last,
        xName: '',

        role: 'Student',
        phone: randomPhone(),
        gender: pick(GENDERS),
        address: pickUserAddress(),

        email,
        username: email,
        schoolId,

        campus: campus.name,
        course: course.name,
        department: course.department,
        yearLevel: getYearLevel(enrollmentYear),

        bDay: birth.bDay,
        bMonth: birth.bMonth,
        bYear: birth.bYear,

        fAllergy: pick([
            'None reported',
            'Dust',
            'Seafood',
            'Pollen'
        ]),

        mAllergy: pick([
            'None reported',
            'Paracetamol',
            'Ibuprofen',
            'None reported'
        ]),

        eName: `${emergencyFirst} ${emergencyLast}`,
        ePhone: randomPhone(),
        eAddress: pickUserAddress(),

        password: crypto.randomBytes(32).toString('hex'),

        archive: false,
        verify: false,
        suspend: false,
        access: 0,
        reset: false,

        dump: true
    };
}

function makeVisit(patientId) {
    const createdAt = randomDate(START_DATE, new Date());
    const status = Math.random() < 0.9
        ? 'Attended'
        : 'Not Attended';

    const visit = {
        _id: new mongoose.Types.ObjectId(),
        archive: false,
        verify: false,
        status,
        complaint: pick(COMPLAINTS),
        concern: pick(CONCERNS),
        patient: patientId,
        createdAt,
        updatedAt: createdAt
    };

    if (status === 'Attended') {
        visit.treatment = pick(TREATMENTS);

        visit.bloodPressure = {
            systolic: randomInt(100, 130),
            diastolic: randomInt(60, 85)
        };

        visit.hBeat = randomInt(60, 100);
        visit.temperature = Number(
            (36.2 + Math.random() * 1.5).toFixed(1)
        );
    }

    return visit;
}

function writeManifest(manifest) {
    const tempPath = `${MANIFEST_PATH}.tmp`;

    fs.writeFileSync(
        tempPath,
        JSON.stringify(manifest, null, 2),
        'utf8'
    );

    fs.renameSync(tempPath, MANIFEST_PATH);
}

function loadExistingManifestSafely() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        return;
    }

    const manifest = JSON.parse(
        fs.readFileSync(MANIFEST_PATH, 'utf8')
    );

    if (
        Array.isArray(manifest.userIds) &&
        Array.isArray(manifest.visitIds) &&
        manifest.userIds.length === 0 &&
        manifest.visitIds.length === 0
    ) {
        fs.unlinkSync(MANIFEST_PATH);
        console.log('Removed stale empty seed manifest.');
        return;
    }

    throw new Error(
        'May existing seed-manifest.json na na may record IDs. ' +
        'I-review muna ito at gamitin ang cleanup command bago mag-seed ulit.'
    );
}

async function seed() {
    loadExistingManifestSafely();

    const existingUsers = await Users.find(
        {},
        {
            fName: 1,
            mName: 1,
            lName: 1,
            email: 1,
            username: 1,
            schoolId: 1,
            role: 1,
            campus: 1,
            dump: 1
        }
    ).lean();

    const usedEmails = new Set();
    const usedUsernames = new Set();
    const usedSchoolIds = new Set();
    const usedNames = new Set();

    for (const user of existingUsers) {
        if (user.email) usedEmails.add(normalize(user.email));
        if (user.username) usedUsernames.add(normalize(user.username));
        if (user.schoolId) usedSchoolIds.add(normalize(user.schoolId));

        if (user.fName && user.mName && user.lName) {
            usedNames.add(
                fullNameKey(user.fName, user.mName, user.lName)
            );
        }
    }

    const combinations = [];

    for (const first of FIRST_NAMES) {
        for (const middle of MIDDLE_NAMES) {
            for (const last of LAST_NAMES) {
                combinations.push({ first, middle, last });
            }
        }
    }

    const shuffledCombinations = shuffle(combinations);
    let nameIndex = 0;
    let schoolSequence = 1;

    function nextUniqueStudent(campus) {
        while (nameIndex < shuffledCombinations.length) {
            const { first, middle, last } =
                shuffledCombinations[nameIndex++];

            const nameKey = fullNameKey(first, middle, last);
            const email = normalize(makeEmail(first, middle, last));

            if (
                usedNames.has(nameKey) ||
                usedEmails.has(email) ||
                usedUsernames.has(email)
            ) {
                continue;
            }

            const enrollmentYear = pick(ENROLLMENT_YEARS);
            const schoolId = makeSchoolId(
                enrollmentYear,
                schoolSequence++,
                usedSchoolIds
            );

            usedNames.add(nameKey);
            usedEmails.add(email);
            usedUsernames.add(email);

            return makeStudent(
                first,
                middle,
                last,
                campus,
                schoolId,
                enrollmentYear
            );
        }

        throw new Error(
            'Naubos ang unique full-name combinations. ' +
            'Dagdagan ang name lists bago mag-seed.'
        );
    }

    const newStudents = [];

    // Generate only the missing accounts for each campus target.
    for (const campus of CAMPUSES) {
        const target = CAMPUS_TARGETS[campus.name];

        if (!Number.isInteger(target) || target < 1) {
            throw new Error(
                `Invalid account target for campus: ${campus.name}`
            );
        }

        const existingSeedCount = existingUsers.filter(user =>
            user.role === 'Student' &&
            user.campus === campus.name &&
            user.dump === true
        ).length;

        const missing = Math.max(0, target - existingSeedCount);

        console.log(
            `${campus.name}: target ${target}; ` +
            `${existingSeedCount} existing seed accounts; ` +
            `generating ${missing}.`
        );

        for (let i = 0; i < missing; i++) {
            newStudents.push(nextUniqueStudent(campus));
        }
    }

    // Every newly generated account receives 5–10 visits.
    const newVisits = [];

    for (const student of newStudents) {
        const visitCount = randomInt(MIN_VISITS, MAX_VISITS);

        for (let i = 0; i < visitCount; i++) {
            newVisits.push(makeVisit(student._id));
        }
    }

    const manifest = {
        createdAt: new Date().toISOString(),
        userIds: newStudents.map(user => String(user._id)),
        visitIds: newVisits.map(visit => String(visit._id))
    };

    // Save IDs before insertion so cleanup can track this run.
    writeManifest(manifest);

    console.log('\nDocuments prepared per campus:');

    for (const campus of CAMPUSES) {
        const count = newStudents.filter(
            student => student.campus === campus.name
        ).length;

        console.log(`${campus.name}: ${count} new accounts`);
    }

    console.log(`Total new accounts: ${newStudents.length}`);
    console.log(`Visits prepared: ${newVisits.length}`);

    const batchSize = 100;
    let insertedUsers = 0;
    let insertedVisits = 0;

    try {
        for (let i = 0; i < newStudents.length; i += batchSize) {
            const batch = newStudents.slice(i, i + batchSize);

            console.log(
                `Inserting users: ${i + 1}-${i + batch.length} ` +
                `of ${newStudents.length}`
            );

            const inserted = await Users.insertMany(batch, {
                ordered: true
            });

            insertedUsers += inserted.length;

            console.log(
                `Successfully inserted users: ${insertedUsers} / ${newStudents.length}`
            );
        }

        for (let i = 0; i < newVisits.length; i += batchSize) {
            const batch = newVisits.slice(i, i + batchSize);

            const inserted = await Visits.insertMany(batch, {
                ordered: true
            });

            insertedVisits += inserted.length;

            console.log(
                `Successfully inserted visits: ${insertedVisits} / ${newVisits.length}`
            );
        }

        console.log('\nSeed completed.');
        console.log(`Inserted users: ${insertedUsers}`);
        console.log(`Inserted visits: ${insertedVisits}`);

        // Show the resulting seed-account totals by campus.
        for (const campus of CAMPUSES) {
            const total = await Users.countDocuments({
                role: 'Student',
                campus: campus.name,
                dump: true
            });

            console.log(
                `${campus.name} total seed accounts: ${total} ` +
                `(target: ${CAMPUS_TARGETS[campus.name]})`
            );
        }

        console.log(
            '\nAfter defense, run: node seedSyntheticData.js cleanup'
        );
    } catch (error) {
        console.error('\nSEED INSERTION FAILED.');
        console.error('The manifest was kept for cleanup tracking.');
        console.error(error);
        throw error;
    }
}

async function cleanup() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        throw new Error(
            'Walang seed-manifest.json. Walang records na binura.'
        );
    }

    const manifest = JSON.parse(
        fs.readFileSync(MANIFEST_PATH, 'utf8')
    );

    if (
        !Array.isArray(manifest.userIds) ||
        !Array.isArray(manifest.visitIds)
    ) {
        throw new Error('Invalid manifest. Cleanup cancelled.');
    }

    const userIds = manifest.userIds.map(
        id => new mongoose.Types.ObjectId(id)
    );

    const visitIds = manifest.visitIds.map(
        id => new mongoose.Types.ObjectId(id)
    );

    const externalVisits = userIds.length
        ? await Visits.find({
            patient: { $in: userIds },
            _id: { $nin: visitIds }
        }).select('patient').lean()
        : [];

    const protectedUsers = new Set(
        externalVisits.map(visit => String(visit.patient))
    );

    const visitResult = await Visits.deleteMany({
        _id: { $in: visitIds }
    });

    const safeUserIds = manifest.userIds
        .filter(id => !protectedUsers.has(String(id)))
        .map(id => new mongoose.Types.ObjectId(id));

    const userResult = safeUserIds.length
        ? await Users.deleteMany({
            _id: { $in: safeUserIds },
            dump: true,
            role: 'Student'
        })
        : { deletedCount: 0 };

    if (protectedUsers.size === 0) {
        fs.unlinkSync(MANIFEST_PATH);
    } else {
        manifest.userIds = manifest.userIds.filter(
            id => protectedUsers.has(String(id))
        );

        manifest.visitIds = [];
        writeManifest(manifest);
    }

    console.log('\nCleanup completed.');
    console.log(`Seed visits deleted: ${visitResult.deletedCount}`);
    console.log(`Seed accounts deleted: ${userResult.deletedCount}`);

    if (protectedUsers.size > 0) {
        console.warn(
            `Protected accounts: ${protectedUsers.size}. ` +
            'May non-seed visits ang mga ito, kaya hindi sila binura.'
        );
    } else {
        console.log('Seed manifest removed.');
    }
}

async function run() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is missing. Check your .env file.');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    const command = process.argv[2];

    if (command === 'seed') {
        await seed();
    } else if (command === 'cleanup') {
        await cleanup();
    } else {
        console.log('Commands:');
        console.log('  node seedSyntheticData.js seed');
        console.log('  node seedSyntheticData.js cleanup');
    }
}

run()
    .catch(error => {
        console.error('\nOperation failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });