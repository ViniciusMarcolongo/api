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

		// Validação do CPF
		if (!cpf) {
			return res.status(400).json({ error: 'CPF não fornecido.' });
		}

		// Sanitiza o CPF (remove caracteres não numéricos)
		const sanitizedCpf = cpf.replace(/\D/g, '');

		if (sanitizedCpf.length !== 11) {
			return res.status(400).json({ error: 'CPF inválido.' });
		}

		try {
			// Verifica o nome do usuário
			if (action === 'search') {
				const query = 'SELECT nome FROM usuarios WHERE cpf = $1';
				const { rows } = await pool.query(query, [sanitizedCpf]);

				if (rows.length > 0) {
					return res.json({ nome: rows[0].nome });
				} else {
					return res.status(404).json({ error: 'Usuário não encontrado.' });
				}
			}

			// Verifica placas cadastradas
			if (action === 'verificar_placas') {
				const checkPlatesQuery = 'SELECT placa FROM veiculos WHERE cpf = $1';
				const { rows } = await pool.query(checkPlatesQuery, [sanitizedCpf]);

				if (rows.length > 0) {
					const placas = rows.map(row => row.placa);
					return res.json({
						success: 'Placas encontradas.',
						placas: placas
					});
				} else {
					return res.status(404).json({
						success: 'Nenhuma placa encontrada para este CPF.'
					});
				}
			}

			// Cadastro de placa
			if (action === 'add_plate') {
				if (!placa) {
					return res.status(400).json({ error: 'Placa não fornecida.' });
				}

				// Sanitiza a placa
				const sanitizedPlaca = placa.trim().toUpperCase();

        // Validação da placa: deve ter exatamente 7 caracteres (letras e números)
				const placaRegex = /^[A-Z0-9]{7}$/;
				if (!placaRegex.test(sanitizedPlaca)) {
					return res.status(400).json({
						error: 'Placa inválida. A placa deve ter exatamente 7 caracteres, com letras e números.',
					});
				}

				// Verifica se a placa já está cadastrada
			const checkQuery = 'SELECT placa FROM veiculos WHERE placa = $1';
				const { rows: existingPlates } = await pool.query(checkQuery, [sanitizedPlaca]);

				if (existingPlates.length > 0) {
					return res.json({
						error: `A placa ${sanitizedPlaca} já está cadastrada.`,
					});
				}

				// Insere a nova placa
				const insertPlateQuery = `
					INSERT INTO veiculos (cpf, placa)
					VALUES ($1, $2)
				`;

				await pool.query(insertPlateQuery, [sanitizedCpf, sanitizedPlaca]);

				return res.json({
					success: 'Placa cadastrada com sucesso.',
					placa: sanitizedPlaca
				});
			}

			return res.status(400).json({ error: 'Ação inválida.' });
		} catch (err) {
			console.error('Erro ao consultar ou atualizar o banco de dados:', err);
			return res.status(500).json({ error: 'Erro ao consultar ou atualizar o banco de dados.' });
		}
	} else {
		// Método não permitido
		return res.status(405).json({ error: 'Método não permitido. Use POST.' });
	}
};
