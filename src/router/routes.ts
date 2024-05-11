import fs from "fs";
import dayjs from 'dayjs';
import { pool } from '../db/db';
import { Request, Response, Router } from 'express';
import {
    verifyToken, hashPassword, getMonthFilter, getMonthNumber,
    generateToken, fillMissingMonths, addRevenusTotalsAndSoldesReel, 
    removeSession, groupCotisationsByMembreId
} from '../helpers/helpers';
import { addCotisation } from '../controllers/controllers';
import { v4 as uuidv4 } from 'uuid';
import mysqldump from "mysqldump";
import dotenv from 'dotenv';

dotenv.config();
const baseRouter = Router();
const MESSAGE_400 = "Oups, une erreur s'est produite !";


/**
 * 
 * @Notes: Endpoint for base route
*/
baseRouter.get("/", async (_req: Request, res: Response) => {
    res.send("Cashbase-api is running...");
});

/**
 * 
 * @Notes: Endpoint to export the database to sql file
*/
baseRouter.get('/export_db', async (_req: Request, res: Response) => {
    try {
        const fileName = "community.sql.gz";
        await mysqldump({
            connection: {
                host: (process.env.DB_HOST)?.split(":")[0],
                port: parseInt(process.env.DB_PORT as string),
                user: process.env.DB_USER as string,
                password: process.env.DB_PASSWORD as string,
                database: process.env.DB_NAME as string
            },
            dumpToFile: `./${fileName}`
        });
        const fileStream = fs.createReadStream(`./${fileName}`);

        // Set response headers to trigger file download
        res.setHeader('Content-disposition', `attachment; filename=${fileName}`);
        res.setHeader('Content-type', 'application/gzip');

        // Pipe the compressed dump to the response
        fileStream.pipe(res);
    } catch (_error: any) {
        res.status(500).send({ error: _error });
    }
});

/**
 * 
 * @Notes: Endpoint for authentications
*/
baseRouter.post("/login", async (_req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, username, is_admin, avatar FROM Membre WHERE username='${_req.body.username}' AND password='${hashPassword(_req.body.password)}';
        `;
        const [rows] = await pool.query(query) as any;
        if (Array.isArray(rows) && rows.length > 0) {
            const user = rows[0];
            const sessionId = uuidv4();
            const token = generateToken({ ...user, session_id: sessionId });
            const dateCreation = dayjs().format('YYYY-MM-DD HH:mm:ss');

            const querySession = `
                INSERT INTO Session(id, token, membre_id, date_creation) 
                VALUES('${sessionId}', '${token}', ${user.id}, '${dateCreation}');
            `;
            await pool.query(querySession);

            res.status(200).send({ success: { user: user, token: token } });
        } else {
            res.status(401).send({ error: "Nom d'utilisateur ou mot de passe incorrect" });
        }
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.get("/logout", verifyToken, async (req: Request, res: Response) => {
    try {
        const remove_all = req.query.remove_all || false;
        const _req: any = { ...req };
        await removeSession(_req.user, JSON.parse(remove_all as any) === true);
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

baseRouter.get("/membre/:id", verifyToken, async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, username, is_admin, avatar FROM Membre WHERE id='${req.params.id}';
        `;
        const [rows] = await pool.query(query) as any;

        const _req: any = { ...req };
        const queryToken = `
            SELECT token FROM Session WHERE id='${_req.user.session_id}' AND membre_id='${_req.user.id}';
        `;
        const [rowsToken] = await pool.query(queryToken) as any;

        res.status(200).send({ success: { user: rows[0], token: rowsToken[0].token } });
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

baseRouter.put("/update_password", verifyToken, async (req: Request, res: Response) => {
    const { id, old_password, new_password } = req.body;
    try {
        const query = `
            UPDATE Membre SET password='${hashPassword(new_password)}' WHERE id='${id}' AND password='${hashPassword(old_password)}';
        `;
        const [rows] = await pool.query(query) as any;
        if (rows.affectedRows === 1) {
            const _req: any = { ...req };
            await removeSession(_req.user, true); // Remove all the user's sessions
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
        const group_by_membre = _req.query.group_by_membre || false;

        let query: string;
        if (!group_by_membre) {
            query = `
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
        } else {
            query = `SELECT membre_id, mois, annee FROM Cotisation;`;
        }
        const [rows] = await pool.query(query);
        res.status(200).send({ success: { cotisations: !group_by_membre ? rows : groupCotisationsByMembreId(rows) } });
    } catch (_error: any) {
        res.status(400).send({ error: _error });
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

baseRouter.post("/add_depense", verifyToken, async (req: Request, res: Response) => {
    try {
        const { date_creation, montant, raison, dette_id } = req.body;

        const query = `
            INSERT INTO Depense(date_creation, montant, raison, dette_id) 
            VALUES('${dayjs(date_creation).format("YYYY-MM-DD")}', ${montant}, '${raison}', ${dette_id ?? null});
        `;
        await pool.query(query) as any;

        if (dette_id) {
            const queryGetDette = `SELECT montant_reste FROM Dette WHERE id = ${dette_id};`;
            const [rows] = await pool.query(queryGetDette) as any;
            if (Array.isArray(rows) && rows.length > 0) {
                const dette = rows[0];
                const montantRestant = dette.montant_reste - montant;
                const queryUpdateDette = `UPDATE Dette SET montant_reste = ${montantRestant} WHERE id = ${dette_id};`;
                await pool.query(queryUpdateDette) as any;
            }
        }
        res.status(200).send({ success: "Dépense ajouté avec succès" });
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
            INSERT INTO Dette(montant, raison, debiteur, montant_reste, is_paye) 
            VALUES(${_req.body.montant}, ${_req.body.raison ? `'${_req.body.raison}'` : null}, '${_req.body.debiteur}', ${_req.body.montant_reste},  ${_req.body.is_paye});
        `;
        const [rows] = await pool.query(query);
        res.status(200).send({ success: rows });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.put("/update_dette", verifyToken, async (req: Request, res: Response) => {
    try {
        const { id, montant, montant_reste, raison, debiteur, is_paye } = req.body;

        const setClauses = [];
        if (montant && montant !== "") setClauses.push(`montant = ${montant}`);
        if (montant_reste && montant_reste !== "") setClauses.push(`montant_reste = ${montant_reste}`);
        if (raison && raison !== "") setClauses.push(`raison = '${raison}'`);
        if (debiteur && debiteur !== "") setClauses.push(`debiteur = '${debiteur}'`);
        if (is_paye && is_paye !== "") setClauses.push(`is_paye = ${is_paye}`);

        const query = `
            UPDATE Dette
            SET ${setClauses.join(', ')}
            WHERE id = ${id};
        `;

        await pool.query(query);
        res.status(200).send({ success: "La dette a été mis à jour" });
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

        const [[rowsDette], [rowsDepense], [rowsCotisation], [rowsRevenu]] = await Promise.all([
            pool.query(queryDette),
            pool.query(queryDepense),
            pool.query(queryCotisation),
            pool.query(queryRevenu)
        ]);

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
            SELECT SUM(montant_reste) AS montant_total
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

        const [[rowsDette], [rowsCotisation], [rowsDepense], [rowsRevenu]] = await Promise.all([
            pool.query(queryTotalDette),
            pool.query(queryTotalCotisation),
            pool.query(queryTotalDepense),
            pool.query(queryTotalRevenu)
        ]) as any;

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