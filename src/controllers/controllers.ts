import { pool } from "../db/db";
import { checkCoherence, checkMonthYear } from "../helpers/helpers";

interface CotisationData {
    montant: number,
    lst_mois_annee: string,
    date_paiement: Date,
    mode_paiement: string,
    membre_id: number
};

export const addCotisation = async (data: CotisationData) => {
    const { validData, dataMessage } = checkMonthYear(data.lst_mois_annee);
    if (!validData) return { status: 400, message: { error: dataMessage } }

    const { coherence, messageCoherence } = checkCoherence(data.montant, dataMessage.length);
    if (!coherence) return { status: 400, message: { error: messageCoherence } }

    let saved: number = 0;
    for (const anneeMois of dataMessage) {
        const queryOne = `
            SELECT * FROM Cotisation WHERE mois = '${anneeMois.mois}' AND annee = '${anneeMois.annee}' AND membre_id = ${data.membre_id};
        `;
        const [rows] = await pool.query(queryOne) as any;

        if (rows.length === 0) {
            const query = `
                INSERT INTO Cotisation(date_paiement, mois, annee, montant, mode_paiement, membre_id) 
                VALUES('${data.date_paiement}', '${anneeMois.mois}', '${anneeMois.annee}', 5000, '${data.mode_paiement}', ${data.membre_id});
            `;
            await pool.query(query);
            saved += 1;
        }
    }
    return { status: 200, message: { success: { total: dataMessage.length, saved: saved, ignored: dataMessage.length - saved } } };
};