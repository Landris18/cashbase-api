import dotenv from 'dotenv';
import mysql2 from "mysql2/promise";

dotenv.config();

const dbUrl = `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}`;
export const pool = mysql2.createPool(dbUrl);