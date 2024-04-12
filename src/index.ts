import express, { Request, Response } from 'express';
import bodyParser from "body-parser";
import cors, { CorsOptions } from "cors";
import { Application, PathParams } from "express-serve-static-core";
import baseRouter from "./router/routes";

const cashbase = express();
const port = 3000;

const options: CorsOptions = {
    allowedHeaders: "*",
    credentials: true,
    methods: "*",
    origin: "*",
    preflightContinue: false,
    exposedHeaders: "Authorization"
};
const corsMiddleware = cors(options);

cashbase.use(corsMiddleware as unknown as PathParams);
cashbase.options("*", corsMiddleware as unknown as Application<Record<string, any>>);
cashbase.use(bodyParser.json());

cashbase.use('/api', baseRouter);

cashbase.get("/", (_req: Request, res: Response) => {
    res.redirect("/api/");
});

cashbase.listen(port, () => {
    console.log(`Listening on port ${port}`);
});