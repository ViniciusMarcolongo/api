const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const caCertPath = path.join(__dirname, 'certs', 'ca.crt');


// Configuração de conexão com o banco de dados
const connectionString =
	'postgresql://postgres:EPLbeW54dAoYD44U@unfailingly-pertinent-vulture.data-1.use1.tembo.io:5432/postgres';

const pool = new Pool({
	connectionString: connectionString,
	ssl: {
    ca: fs.readFileSync(caCertPath).toString(),
}

});

// Função da API
module.exports = async (req, res) => {
	if (req.method === 'POST') {
		const { cpf, placa, action } = req.body;

		if (!cpf) {
			return res.status(400).json({ error: 'CPF não fornecido.' });
		}

		// Sanitiza o CPF (remove caracteres não numéricos)
		const sanitizedCpf = cpf.replace(/\D/g, '');
		if (sanitizedCpf.length !== 11) {
			return res.status(400).json({ error: 'CPF inválido.' });
		}

		try {
			if (action === 'search') {
				// Buscar informações pelo CPF
				const query = 'SELECT nome FROM usuarios WHERE cpf = $1';
				const { rows } = await pool.query(query, [sanitizedCpf]);

				if (rows.length > 0) {
					return res.json({ nome: rows[0].nome });
				} else {
					return res.status(404).json({ error: 'Usuário não encontrado.' });
				}
			} else if (action === 'add_plate') {
				if (!placa) {
					return res.status(400).json({ error: 'Placa não fornecida.' });
				}

				// Sanitiza a placa
				const sanitizedPlaca = placa.trim().toUpperCase();

				// Query para inserir a placa
				const query = `
					INSERT INTO veiculos (cpf, placa)
					VALUES ($1, $2)
					ON CONFLICT (placa) DO NOTHING
				`;

				await pool.query(query, [sanitizedCpf, sanitizedPlaca]);
				return res.json({ success: 'Placa cadastrada com sucesso.' });
			} else {
				return res.status(400).json({ error: 'Ação inválida.' });
			}
		} catch (err) {
			console.error('Erro ao consultar ou atualizar o banco de dados:', err);
			return res.status(500).json({ error: 'Erro ao consultar ou atualizar o banco de dados.' });
		}
	} else {
		// Apenas métodos POST são permitidos
		res.status(405).json({ error: 'Método não permitido. Use POST.' });
	}
};
