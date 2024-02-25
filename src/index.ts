import express, { Request, Response } from 'express';
import bodyParser from "body-parser";
import cors, { CorsOptions } from "cors";
import { Application, PathParams } from "express-serve-static-core";
import baseRouter from "./router/routes";


const daz = express();
const port = 3000;

const options: CorsOptions = {
    allowedHeaders: "*",
    credentials: true,
    methods: "*",
    origin: "*",
    preflightContinue: false
};
const corsMiddleware = cors(options);

daz.use(corsMiddleware as unknown as PathParams);
daz.options("*", corsMiddleware as unknown as Application<Record<string, any>>);
daz.use(bodyParser.json());

daz.use('/api', baseRouter);

daz.get("/", (_req: Request, res: Response) => {
    res.redirect("/api/");
});


daz.listen(port, () => {
    console.log(`Listening on port ${port}`);
});