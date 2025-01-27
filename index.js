const { Pool } = require('pg');
const fs = require('fs');


// Configuração de conexão
const connectionString =
	'postgresql://postgres:EPLbeW54dAoYD44U@unfailingly-pertinent-vulture.data-1.use1.tembo.io:5432/postgres';

const pool = new Pool({
	connectionString: connectionString,
	ssl: {
		ca: fs.readFileSync('./certs/ca.crt').toString(),
	},
});

// Função para testar a conexão com o banco de dados
async function testQuery() {
	const client = await pool.connect();
	try {
		const response = await client.query('SELECT 1');
		console.log(response.rows[0]['?column?']);
	} finally {
		client.release();
	}
}

testQuery();

// Função da API (corrigido para usar o pool de conexões)
module.exports = async (req, res) => {
    if (req.method === 'POST') {
        const { cpf } = req.body;

        if (!cpf) {
            return res.status(400).json({ error: 'CPF não fornecido.' });
        }

        const sanitizedCpf = cpf.replace(/\D/g, ''); // Remove caracteres não numéricos

        if (sanitizedCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido.' });
        }

        // Usando o pool para realizar a consulta
        const query = 'SELECT nome FROM usuarios WHERE cpf = $1'; // Usando parâmetro seguro
        try {
            const { rows } = await pool.query(query, [sanitizedCpf]);

            if (rows.length > 0) {
                return res.json({ nome: rows[0].nome });
            } else {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }
        } catch (err) {
            console.error('Erro ao consultar o banco de dados:', err);
            return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
        }
    } else {
        res.status(405).json({ error: 'Método não permitido.' });
    }
};
