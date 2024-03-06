import { pool } from '../db/db';
import { Request, Response, Router } from 'express';
import { fillMissingMonths, generateTokenJWT, getMonthFilter, hashPassword, verifyToken } from '../helpers/helpers';
import { addCotisation } from '../controllers/controllers';


const MESSAGE_400 = "Oups, une erreur s'est produite. Veuillez contacter Landry Manankoraisina !";
const baseRouter = Router();


baseRouter.get("/", async (_req: Request, res: Response) => {
    res.send("Cashbase-api is running...");
});

baseRouter.post("/login", async (_req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, username, is_admin, avatar FROM Membre WHERE username='${_req.body.username}' AND password='${hashPassword(_req.body.password)}';
        `;
        const [rows] = await pool.query(query);
        if (Array.isArray(rows) && rows.length > 0) {
            const user = rows[0];
            const token = generateTokenJWT(user);
            res.status(200).send({ success: { user: user, token: token } });
        } else {
            res.status(401).send({ error: "Echec d'authentification !" });
        }
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

baseRouter.get("/cotisations", verifyToken, async (_req: Request, res: Response) => {
    try {
        const { moisFilter, anneeFilter } = getMonthFilter();
        const mois = _req.query.mois || moisFilter;
        const annee = _req.query.annee || anneeFilter;
        const paidOnly = _req.query.paidOnly || false;

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
            ${paidOnly ? "WHERE" : "AND"} Cotisation.mois = '${mois}' AND Cotisation.annee = '${annee}';
        `;

        const queryTotal = `
            SELECT SUM(montant) AS montant_total
            FROM Cotisation
            WHERE mode_paiement <> 'Autres';
        `;

        const [rows] = await pool.query(query);
        const [rowsTotal] = await pool.query(queryTotal) as any;
        res.status(200).send(
            { success: { cotisations: rows, montant_total: rowsTotal[0].montant_total } }
        );
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

baseRouter.get("/membre/:id", verifyToken, async (_req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, username, is_admin, avatar FROM Membre WHERE id='${_req.params.id}';
        `;
        const [rows] = await pool.query(query);
        res.status(200).send({ success: rows });
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

baseRouter.get("/dettes", verifyToken, async (_req: Request, res: Response) => {
    try {
        const query = `SELECT * FROM Dette;`
        const queryTotal = `            
            SELECT SUM(montant) AS montant_total
            FROM Dette;
        `;

        const [rows] = await pool.query(query);
        const [rowsTotal] = await pool.query(queryTotal) as any;
        res.status(200).send({ success: { dettes: rows, montant_total: rowsTotal[0].montant_total } });
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
                WHERE YEAR(date_creation) = 2024
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
            success: fillMissingMonths({
                dettes: rowsDette,
                depenses: rowsDepense,
                cotisations: rowsCotisation,
                revenus: rowsRevenu
            })
        });
    } catch (_error: any) {
        res.status(400).send({ error: MESSAGE_400 });
    }
});

export default baseRouter;