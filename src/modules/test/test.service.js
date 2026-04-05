
import db from '../../config/db.js';

export const createUserService = async (body) => {

    const { name, mobile, age, description, role } = body;

    const [result] = await db.execute(

        `INSERT INTO CHANDRA (name,mobile,age,description,role)   VALUES(?,?,?,?,?)`,

        [name, mobile, age, description, role])

    const [rows] = await db.query(
        `SELECT * FROM CHANDRA WHERE id=?`,
        [result.insertId]

    )
    return rows[0];
}

export const getAllUserService = async () => {

    const [result] = await db.execute(
        `SELECT id, name, mobile, age, description, role,created_at FROM CHANDRA
         ORDER BY created_at DESC`
    )
    return result;
}

