import { pool } from '../db/db';
import { Request, Response, Router } from 'express';
import {
    verifyToken, hashPassword, getMonthFilter, getMonthNumber,
    generateJwt, fillMissingMonths, addRevenusTotalsAndSoldesReel, removeSessionId
} from '../helpers/helpers';
import { addCotisation } from '../controllers/controllers';
import { v4 as uuidv4 } from 'uuid';


const MESSAGE_400 = "Oups, une erreur s'est produite !";
const baseRouter = Router();


/**
 * 
 * @Notes: Endpoint for route
*/
baseRouter.get("/", async (_req: Request, res: Response) => {
    res.send("Cashbase-api is running...");
});

/**
 * 
 * @Notes: Endpoint for authentications
*/
baseRouter.post("/login", async (_req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, username, is_admin, avatar, session_ids FROM Membre WHERE username='${_req.body.username}' AND password='${hashPassword(_req.body.password)}';
        `;
        const [rows] = await pool.query(query) as any;
        if (Array.isArray(rows) && rows.length > 0) {
            const user = rows[0];
            const sessionId = uuidv4();
            const currentUserSessionIds = rows[0].session_ids;

            const querySet = `
                UPDATE Membre 
                SET session_ids='${['', null].includes(currentUserSessionIds) ? sessionId : `${currentUserSessionIds},${sessionId}`}' 
                WHERE id=${rows[0].id};
            `;
            await pool.query(querySet);

            const token = generateJwt({ ...user, session_id: sessionId });
            delete user.session_ids
            res.status(200).send({ success: { user: user, token: token } });
        } else {
            res.status(401).send({ error: "Nom d'utilisateur ou mot de passe incorrect" });
        }
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

/**
 * 
 * @Notes: Endpoint for authentications
*/
baseRouter.get("/logout", verifyToken, async (req: Request, res: Response) => {
    try {
        const remove_all = req.query.remove_all || false;
        const _req: any = { ...req };
        await removeSessionId(_req.user, JSON.parse(remove_all as any) === true);
        res.status(200).send({ success: "Déconnexion réussie" });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

/**
 * 
 * @Notes: Endpoints for membres
*/
baseRouter.get("/membres", verifyToken, async (_req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, username, is_admin, avatar FROM Membre ORDER BY username;
        `;
        const [rows] = await pool.query(query);
        res.status(200).send({ success: rows });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.get("/membre/:id", verifyToken, async (_req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, username, is_admin, avatar FROM Membre WHERE id='${_req.params.id}';
        `;
        const [rows] = await pool.query(query) as any;
        res.status(200).send({ success: { user: rows[0] } });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.post("/add_membre", verifyToken, async (_req: Request, res: Response) => {
    try {
        const query = `
            INSERT INTO Membre(username, password, is_admin) 
            VALUES('${_req.body.username}', '${hashPassword(_req.body.password)}', ${_req.body.is_admin});
        `;
        const [rows] = await pool.query(query);
        res.status(200).send({ success: rows });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.put("/update_password", verifyToken, async (_req: Request, res: Response) => {
    const { id, old_password, new_password } = _req.body;
    try {
        const query = `
            UPDATE Membre SET password='${hashPassword(new_password)}' WHERE id='${id}' AND password='${hashPassword(old_password)}';
        `;
        const [rows] = await pool.query(query) as any;
        if (rows.affectedRows === 1) {
            res.status(200).send({ success: "Votre mot de passe a été mis à jour" });
        } else {
            res.status(400).send({ error: "Impossible de trouver votre compte" });
        }
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

/**
 * 
 * @Notes: Endpoints for cotisations
*/
baseRouter.get("/cotisations", verifyToken, async (_req: Request, res: Response) => {
    try {
        const { moisFilter, anneeFilter } = getMonthFilter();
        const mois = _req.query.mois || moisFilter;
        const annee = _req.query.annee || anneeFilter;
        const only_paid = _req.query.only_paid || false;

        const query = `
            SELECT 
                Membre.username, 
                Cotisation.date_paiement, 
                Cotisation.mois, 
                Cotisation.annee, 
                Cotisation.montant, 
                Cotisation.mode_paiement
            FROM Membre
            LEFT JOIN Cotisation ON Membre.id = Cotisation.membre_id 
            ${JSON.parse(only_paid as any) === true ? "WHERE" : "AND"} Cotisation.mois = '${mois}' AND Cotisation.annee = ${annee}
            ORDER BY Cotisation.date_paiement ASC;
        `;

        const [rows] = await pool.query(query);
        res.status(200).send({ success: { cotisations: rows } });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.post("/add_cotisations", verifyToken, async (_req: Request, res: Response) => {
    try {
        const { status, message } = await addCotisation(_req.body);
        res.status(status).send(message);
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

/**
 * 
 * @Notes: Endpoints for revenus
*/
baseRouter.get("/revenus", verifyToken, async (_req: Request, res: Response) => {
    try {
        const annee = _req.query.annee || new Date().getFullYear();
        const mois = getMonthNumber(_req.query.mois as any) || new Date().getMonth() + 1;

        const query = `
            SELECT * FROM Revenu WHERE YEAR(date_creation) = ${annee} AND MONTH(date_creation) = ${mois} ORDER BY date_creation DESC;
        `;

        const [rows] = await pool.query(query);
        res.status(200).send({ success: { revenus: rows } });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

/**
 * 
 * @Notes: Endpoints for depenses
*/
baseRouter.get("/depenses", verifyToken, async (_req: Request, res: Response) => {
    try {
        const annee = _req.query.annee || new Date().getFullYear();
        const mois = getMonthNumber(_req.query.mois as any) || new Date().getMonth() + 1;
        const for_dette: any = _req.query.for_dette || false;

        const query = `
            SELECT *
            FROM Depense 
            WHERE YEAR(date_creation) = ${annee} AND MONTH(date_creation) = ${mois} ${JSON.parse(for_dette as any) === true ? "AND dette_id IS NOT NULL" : ""}
            ORDER BY date_creation DESC;
        `;

        const [rows] = await pool.query(query) as any;
        res.status(200).send({ success: { depenses: rows } });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

/**
 * 
 * @Notes: Endpoints for dettes
*/
baseRouter.get("/dettes", verifyToken, async (_req: Request, res: Response) => {
    try {
        const query = `SELECT * FROM Dette ORDER BY date_creation DESC;`;
        const [rows] = await pool.query(query);
        res.status(200).send({ success: { dettes: rows } });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.post("/add_dette", verifyToken, async (_req: Request, res: Response) => {
    try {
        const query = `
            INSERT INTO Dette(montant, raison, debiteur, is_paye) 
            VALUES(${_req.body.montant}, ${_req.body.raison ? `'${_req.body.raison}'` : null}, '${_req.body.debiteur}', ${_req.body.is_paye});
        `
        const [rows] = await pool.query(query);
        res.status(200).send({ success: rows });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.put("/update_dette", verifyToken, async (req: Request, res: Response) => {
    try {
        const { id, montant, raison, debiteur, is_paye } = req.body;

        const setClauses = [];
        if (montant && montant !== "") setClauses.push(`montant = '${montant}'`);
        if (raison && raison !== "") setClauses.push(`raison = '${raison}'`);
        if (debiteur && debiteur !== "") setClauses.push(`debiteur = '${debiteur}'`);
        if (is_paye && is_paye !== "") setClauses.push(`is_paye = ${is_paye}`);

        const query = `
            UPDATE Dette
            SET ${setClauses.join(', ')}
            WHERE id = ${id};
        `;

        const [rows] = await pool.query(query);
        res.status(200).send({ success: rows });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

/**
 * 
 * @Notes: Endpoints for stats and totals
*/
baseRouter.get("/get_stats", verifyToken, async (req: Request, res: Response) => {
    try {
        const annee = req.query.annee || new Date().getFullYear();

        const queryDette = `
            SELECT
                MONTH(date) AS mois,
                COALESCE(SUM(totalMontantDette), 0) - COALESCE(SUM(totalMontantPaiement), 0) AS totalMontant
            FROM (
                SELECT date_creation AS date, montant AS totalMontantDette, 0 AS totalMontantPaiement
                FROM Dette
                WHERE YEAR(date_creation) = ${annee}
                UNION ALL
                SELECT DP.date_creation, 0 AS totalMontantDette, COALESCE(SUM(DP.montant), 0) AS totalMontantPaiement
                FROM Depense DP
                LEFT JOIN Dette D ON DP.dette_id = D.id
                WHERE YEAR(D.date_creation) = ${annee}
                GROUP BY DP.date_creation
            ) AS combined_data
            GROUP BY YEAR(date), MONTH(date)
            ORDER BY YEAR(date), MONTH(date);
        `;

        const queryDepense = `
            SELECT 
                MONTH(date_creation) AS mois,
                COALESCE(SUM(montant), 0) AS totalMontant
            FROM Depense
            WHERE YEAR(date_creation) = ${annee}
            GROUP BY YEAR(date_creation), MONTH(date_creation)
            ORDER BY YEAR(date_creation), MONTH(date_creation);
        `;

        const queryCotisation = `
            SELECT 
                MONTH(date_paiement) AS mois,
                COALESCE(SUM(montant), 0) AS totalMontant
            FROM Cotisation
            WHERE YEAR(date_paiement) = ${annee}
            GROUP BY YEAR(date_paiement), MONTH(date_paiement)
            ORDER BY YEAR(date_paiement), MONTH(date_paiement);
        `;

        const queryRevenu = `
            SELECT 
                MONTH(date_creation) AS mois,
                COALESCE(SUM(montant), 0) AS totalMontant
            FROM Revenu
            WHERE YEAR(date_creation) = ${annee}
            GROUP BY YEAR(date_creation), MONTH(date_creation)
            ORDER BY YEAR(date_creation), MONTH(date_creation);
        `;

        const [rowsDette] = await pool.query(queryDette);
        const [rowsDepense] = await pool.query(queryDepense);
        const [rowsCotisation] = await pool.query(queryCotisation);
        const [rowsRevenu] = await pool.query(queryRevenu);

        res.status(200).send({
            success: addRevenusTotalsAndSoldesReel(
                fillMissingMonths({
                    dettes: rowsDette,
                    depenses: rowsDepense,
                    cotisations: rowsCotisation,
                    revenus: rowsRevenu
                })
            )
        });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.get("/get_totals", verifyToken, async (_req: Request, res: Response) => {
    try {
        const queryTotalDette = `            
            SELECT SUM(montant) AS montant_total
            FROM Dette
            WHERE is_paye = 0;
        `;
        const queryTotalCotisation = `
            SELECT SUM(montant) AS montant_total
            FROM Cotisation;
        `;
        const queryTotalDepense = `
            SELECT SUM(montant) AS montant_total
            FROM Depense;
        `;
        const queryTotalRevenu = `
            SELECT SUM(montant) AS montant_total
            FROM Revenu;
        `;

        const [rowsDette] = await pool.query(queryTotalDette) as any;
        const [rowsDepense] = await pool.query(queryTotalDepense) as any;
        const [rowsRevenu] = await pool.query(queryTotalRevenu) as any;
        const [rowsCotisation] = await pool.query(queryTotalCotisation) as any;

        const total_dettes = rowsDette[0].montant_total ? parseInt(rowsDette[0].montant_total) : 0;
        const total_cotisations = rowsCotisation[0].montant_total ? parseInt(rowsCotisation[0].montant_total) : 0;
        const total_depenses = rowsDepense[0].montant_total ? parseInt(rowsDepense[0].montant_total) : 0;
        const total_revenus = rowsRevenu[0].montant_total ? parseInt(rowsRevenu[0].montant_total) : 0;
        const total_revenus_total = total_revenus + total_cotisations;
        const total_soldes = total_revenus + total_cotisations - total_depenses;
        const total_soldes_reel = total_revenus + total_cotisations - total_depenses - total_dettes;

        res.status(200).send({
            success: {
                total_dettes: total_dettes,
                total_cotisations: total_cotisations,
                total_depenses: total_depenses,
                total_revenus: total_revenus,
                total_revenus_total: total_revenus_total,
                total_soldes: total_soldes,
                total_soldes_reel: total_soldes_reel
            }
        });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

export default baseRouter;