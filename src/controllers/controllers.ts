import { pool } from "../db/db";
import { checkCoherence, checkMonthYear } from "../helpers/helpers";

const COTISATIONS_MESSAGE = "Toutes les cotisations sont enregistrées";

interface CotisationData {
    montant: number,
    lst_mois_annee: string,
    date_paiement: Date,
    mode_paiement: string,
    membre_id: number
};

export const addCotisation = async (data: CotisationData) => {
    const { status, message } = checkMonthYear(data.lst_mois_annee);
    if (!status) return { status: 400, message: message }

    const { coherence, messageCoherence } = checkCoherence(data.montant, message.length);
    if (!coherence) return { status: 400, message: messageCoherence }

    for (const anneeMois of message) {
        const query = `
            INSERT INTO Cotisation(date_paiement, mois, annee, montant, mode_paiement, membre_id) 
            VALUES('${data.date_paiement}', '${anneeMois.mois}', '${anneeMois.annee}', 5000, '${data.mode_paiement}', ${data.membre_id});
        `;
        await pool.query(query);
    }
    return { status: 200, message: COTISATIONS_MESSAGE };
};