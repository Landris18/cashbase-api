import jwt from "jsonwebtoken";
import dotenv from 'dotenv';
import crypto from "crypto";
import { Response } from 'express';

dotenv.config();

const MONTH_OPTIONS = { month: "long" } as any;
const FR_LOCALE = 'fr-FR';
const MONTH_YEAR_REGEX = new RegExp(
    `^(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\\s(${new Date().getFullYear()}|${new Date().getFullYear() + 1})$`
);


/**
 * 
 * @Notes: Functions for token manipulation
*/

export const generateTokenJWT = (user: any): string => {
    const payload = {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin
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

        jwt.verify(bearerToken, process.env.SECRET_KEY as string, (err: any, decoded: any) => {
            if (err) {
                return res.status(403).json({ error: "Bad token" });
            }
            if ((decoded.is_admin === 0 && req.method !== "GET")) {
                return res.status(401).json({ error: "Unauthorized" });
            }
            req.user = decoded;
            next();
        });
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
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

export const checkMonthYear = (dataMoisAnnee: string) => {
    var list_mois_annee: any[] = [];
    dataMoisAnnee = dataMoisAnnee.trim();
    if (!["", null, undefined].includes(dataMoisAnnee)) {
        const lst_mois_annee = dataMoisAnnee.split(",");
        for (const mois_annee of lst_mois_annee) {
            if (MONTH_YEAR_REGEX.test(mois_annee.trim())) {
                const mois = mois_annee.trim().split(" ")[0].trim();
                const annee = mois_annee.trim().split(" ")[1].trim();
                if (!monthsList.includes(mois)) {
                    return { validData: false, dataMessage: `Le mois ${mois} n'est pas dans la liste des mois Français.` };
                }
                if (![new Date().getFullYear(), new Date().getFullYear() + 1].includes(parseInt(annee))) {
                    return { validData: false, dataMessage: `L'année ${annee} n'est pas entre ${new Date().getFullYear()} et ${new Date().getFullYear() + 1}.` };
                }
                list_mois_annee.push({ mois: mois, annee: annee });
            }
        }
    }
    return {
        validData: list_mois_annee.length > 0,
        dataMessage: list_mois_annee.length > 0 ? list_mois_annee : "Pas de mois/année"
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


/**
 * 
 * @Notes: Functions used locally in helpers
*/

const capitalizeFirstLetter = (string: string): string => {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

const monthsList = Array.from({ length: 12 }, (_, index) => {
    const formatter = new Intl.DateTimeFormat(FR_LOCALE, MONTH_OPTIONS);
    const date = new Date(2000, index, 1);
    return capitalizeFirstLetter(formatter.format(date));
});