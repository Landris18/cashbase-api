import jwt from "jsonwebtoken";
import dotenv from 'dotenv';
import crypto from "crypto";
import { Response } from 'express';
import { pool } from '../db/db';

dotenv.config();

const MONTH_OPTIONS = { month: "long" } as any;
const FR_LOCALE = 'fr-FR';
const MONTH_YEAR_REGEX = new RegExp(
    `^(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\\s(${new Date().getFullYear()}|${new Date().getFullYear() + 1})$`
);

const whiteListPath = ["/update_password"];

interface MontantItem {
    mois: number;
    totalMontant: number;
}

interface ResultObject {
    dettes: MontantItem[];
    depenses: MontantItem[];
    cotisations: MontantItem[];
    revenus: MontantItem[];
}

/**
 * 
 * @Notes: Functions for token manipulation
*/

export const generateJwt = (user: any): string => {
    const payload = {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
        session_id: user.session_id
    };
    const options = {
        expiresIn: '48h'
    };
    const token = jwt.sign(payload, process.env.SECRET_KEY as string, options);
    return token
};

export const verifyToken = (req: any, res: Response, next: () => void) => {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearerToken = bearerHeader.split(' ')[1];
        jwt.verify(bearerToken, process.env.SECRET_KEY as string, async (err: any, decoded: any) => {

            const sessionValid = await isValidSessionId(jwt.decode(bearerToken));
            if (err || !sessionValid) {
                await removeSessionId(jwt.decode(bearerToken));
                return res.status(403).json({ error: "Token expired" });
            }

            if (decoded.is_admin === 0 && req.method !== "GET") {
                if (!whiteListPath.includes(req.route.path)) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
            }

            req.user = decoded;
            next();
        });
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

const isValidSessionId = async (user: any) => {
    const query = `
        SELECT session_ids FROM Membre WHERE id=${user?.id};
    `;
    const [rows] = await pool.query(query) as any;
    const currentUserSessionIds: string = rows[0]?.session_ids;
    console.log(currentUserSessionIds.split(","), user);
    
    return currentUserSessionIds.split(",").includes(user?.session_id);
};

const removeSessionId = async (user: any) => {
    const query = `
        SELECT session_ids FROM Membre WHERE id=${user?.id};
    `;
    const [rows] = await pool.query(query) as any;
    const currentUserSessionIds: string = rows[0]?.session_ids;
    let newUserSessionIdsList: string[] = [...currentUserSessionIds.split(",")];

    const index = newUserSessionIdsList.indexOf(user?.session_id);
    if (index !== -1) {
        newUserSessionIdsList = newUserSessionIdsList.splice(index, 1);
    }

    const querySet = `
        UPDATE Membre 
        SET session_ids='${newUserSessionIdsList.join(",")}'
        WHERE id=${user?.id};
    `;
    await pool.query(querySet);
};

/**
 * 
 * @Notes: Utils functions used in router or controller
*/

export const hashPassword = (password: string): string => {
    const iterations = 100000;
    const keylen = 64;
    const salt = process.env.SECRET_KEY as string;
    const hashedPassword = crypto.pbkdf2Sync(password, salt, iterations, keylen, 'sha256');
    return hashedPassword.toString('hex');
};

export const getMonthFilter = (): any => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const previousMonth = (currentMonth - 1 + 12) % 12;
    const firstDayOfPreviousMonth = new Date(currentDate.getFullYear(), previousMonth, 1);

    const formatter = new Intl.DateTimeFormat(FR_LOCALE, MONTH_OPTIONS);

    const mois = capitalizeFirstLetter(formatter.format(firstDayOfPreviousMonth));

    const minus = mois === "Décembre" ? 1 : 0;
    return { moisFilter: mois, anneeFilter: (new Date().getFullYear() - minus) };
};

export const checkMonthYear = (dataMoisAnnee: string[]) => {
    var list_mois_annee: any[] = [];
    if (dataMoisAnnee.length > 0) {
        for (const mois_annee of dataMoisAnnee) {
            if (MONTH_YEAR_REGEX.test(mois_annee.trim())) {
                const mois = mois_annee.trim().split(" ")[0].trim();
                const annee = mois_annee.trim().split(" ")[1].trim();
                if (!monthsList.includes(mois)) {
                    return { validData: false, dataOrMessage: `Le mois ${mois} n'est pas dans la liste des mois Français.` };
                }
                if (![new Date().getFullYear(), new Date().getFullYear() + 1].includes(parseInt(annee))) {
                    return { validData: false, dataOrMessage: `L'année ${annee} n'est pas entre ${new Date().getFullYear()} et ${new Date().getFullYear() + 1}.` };
                }
                list_mois_annee.push({ mois: mois, annee: annee });
            }
        }
    }
    return {
        isDataValid: list_mois_annee.length > 0,
        dataOrMessage: list_mois_annee.length > 0 ? list_mois_annee : "Pas de mois/année"
    }
};

export const checkCoherence = (montant: number, lenDataMois: number) => {
    const expectedMontant = 5000 * lenDataMois;
    const coherence = montant === expectedMontant;
    return {
        coherence: coherence,
        messageCoherence: coherence ? `` : "Incohérence entre le montant et le nombre des mois"
    }
};

export const fillMissingMonths = (data: any): ResultObject => {
    const result: ResultObject = {
        dettes: [],
        depenses: [],
        cotisations: [],
        revenus: []
    };

    const { dettes, depenses, cotisations, revenus } = data;

    const allMonths = [...dettes, ...depenses, ...cotisations, ...revenus].map((item) => item.mois);
    const minMonth = Math.min(...allMonths);
    const maxMonth = new Date().getMonth() + 1;

    for (let i = minMonth; i <= maxMonth; i++) {
        const dettesForMonth = dettes.find((item: MontantItem) => item.mois === i);
        result.dettes.push({
            mois: i,
            totalMontant: dettesForMonth ? parseInt(dettesForMonth.totalMontant) : 0
        });
    }

    for (let i = minMonth; i <= maxMonth; i++) {
        const depensesForMonth = depenses.find((item: MontantItem) => item.mois === i);
        result.depenses.push({
            mois: i,
            totalMontant: depensesForMonth ? parseInt(depensesForMonth.totalMontant) : 0
        });
    }

    for (let i = minMonth; i <= maxMonth; i++) {
        const cotisationsForMonth = cotisations.find((item: MontantItem) => item.mois === i);
        result.cotisations.push({
            mois: i,
            totalMontant: cotisationsForMonth ? parseInt(cotisationsForMonth.totalMontant) : 0
        });
    }

    for (let i = minMonth; i <= maxMonth; i++) {
        const revenusForMonth = revenus.find((item: MontantItem) => item.mois === i);
        result.revenus.push({
            mois: i,
            totalMontant: revenusForMonth ? parseInt(revenusForMonth.totalMontant) : 0
        });
    }

    result.dettes = accumulateDette(result.dettes);
    return result;
}

export const addRevenusTotalsAndSoldesReel = (data: any) => {
    const cotisationsArray = data.cotisations;
    const revenusArray = data.revenus;
    const depensesArray = data.depenses;
    const dettesArray = data.dettes;

    const revenusTotalArray = cotisationsArray.map((cotisation: any) => {
        const mois = cotisation.mois;
        const cotisationTotal = cotisation.totalMontant;
        const revenusTotal = revenusArray.find((revenu: any) => revenu.mois === mois)?.totalMontant || 0;

        return {
            mois,
            totalMontant: cotisationTotal + revenusTotal
        };
    });
    data.revenus_total = revenusTotalArray;

    const soldesReelArray = revenusTotalArray.map((revenusTotal: any) => {
        const mois = revenusTotal.mois;
        const depenses = depensesArray.find((depense: any) => depense.mois === mois)?.totalMontant || 0;
        const dettes = dettesArray.find((dette: any) => dette.mois === mois)?.totalMontant || 0;

        return {
            mois,
            totalMontant: revenusTotal.totalMontant - depenses - dettes
        };
    });
    data.soldes_reel = soldesReelArray;

    return data;
}

const capitalizeFirstLetter = (string: string): string => {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

const monthsList = Array.from({ length: 12 }, (_, index) => {
    const formatter = new Intl.DateTimeFormat(FR_LOCALE, MONTH_OPTIONS);
    const date = new Date(2000, index, 1);
    return capitalizeFirstLetter(formatter.format(date));
});

export const getMonthNumber = (monthFrenchString: string): number | null => {
    const index: number = monthsList.findIndex(item => item === monthFrenchString);
    return index >= 0 ? index + 1 : null;
}

const accumulateDette = (dettes: any) => {
    let accumulatedTotalMontant = 0;
    const modifiedDettesList = dettes.map((item: any) => {
        accumulatedTotalMontant += item.totalMontant;
        return {
            mois: item.mois,
            totalMontant: accumulatedTotalMontant
        };
    });
    return modifiedDettesList;
};