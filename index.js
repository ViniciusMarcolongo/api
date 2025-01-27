const { Client } = require('pg');

// Configuração do banco de dados PostgreSQL
const client = new Client({
    host: 'unfailingly-pertinent-vulture.data-1.use1.tembo.io',
    user: 'postgres',
    password: 'EPLbeW54dAoYD44U',
    database: 'zonaazul',
    port: 5432,
});

// Conexão ao banco de dados
client.connect(err => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
        return;
    }
    console.log('Conectado ao banco de dados!');
});

// Função da API
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

        const query = 'SELECT nome FROM usuarios WHERE cpf = $1'; // Usando parâmetro de forma segura
        client.query(query, [sanitizedCpf], (err, results) => {
            if (err) {
                console.error('Erro ao consultar o banco de dados:', err);
                return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
            }

            if (results.rows.length > 0) {
                return res.json({ nome: results.rows[0].nome });
            } else {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }
        });
    } else {
        res.status(405).json({ error: 'Método não permitido.' });
    }
};
