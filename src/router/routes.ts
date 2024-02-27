import { pool } from '../db/db';
import { Request, Response, Router } from 'express';
import { generateTokenJWT, getMonthFilter, hashPassword, verifyToken } from '../helpers/helpers';
import { addCotisation } from '../controllers/controllers';


const MESSAGE_400 = "Oups, une erreur s'est produite. Veuillez contacter Landry Manankoraisina !";
const baseRouter = Router();


baseRouter.get("/", async (_req: Request, res: Response) => {
    res.send("Cashbase-api is running...");
});

baseRouter.post("/login", async (_req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, username, is_admin FROM Membre WHERE username='${_req.body.username}' AND password='${hashPassword(_req.body.password)}';
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

baseRouter.post("/add_membre", verifyToken, async (_req: Request, res: Response) => {
    try {
        const query = `
            INSERT INTO Membre(username, password, is_admin) 
            VALUES('${_req.body.username}', '${hashPassword(_req.body.password)}', ${_req.body.is_admin});
        `
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

export default baseRouter;