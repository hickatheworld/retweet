const {join} = require('path');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const Logger = require('../misc/Logger');
const User = require('./User');
const Tweet = require('./Tweet');
const {instanciateTweet, formatTweetList} = require('../misc/TweetUtils');

let {rename} = require('fs');
const {promisify} = require('util');
rename = promisify(rename);

/**
 * Classe utilitaire pour les intéractions avec la base de données.
 */
class Database {
	/**
	 * @param {string} host Nom d'hôte de la base de données.
	 * @param {string} user Utilisateur de base données.
	 * @param {string} password Mot de passe de l'utilisateur.
	 */
	constructor(host, user, password) {
		this.host = host;
		this.user = user;
		this.password = password;
		this.connection = null;
		this.log = new Logger('Base de données');
	}

	/**
	 * Se connecte à la base de données.
	 */
	async connect() {
		this.connection = await mysql.createConnection({
			host: this.host,
			user: this.user,
			password: this.password,
			database: 'retweet'
		});
	}

	/**
	 * Génère un id unique pour une nouvelle entrée dans la base de données.
	 * @returns {Promise<string>} Generated id.
	 */
	async generateId() {
		const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';
		const id = Array(16)
			.fill()
			.map(() => chars[Math.floor(Math.random() * chars.length)])
			.join('');
		// Vérifie si l'id existe déjà, si oui, en génère un autre récursivement.
		const [rows] = await this.connection.query('SELECT * FROM Id WHERE id = ? ', [id]);
		if (rows.length !== 0)
			return await this.generateId();
		return id;
	}

	/**
	 * Récupère un utilisateur par son id.
	 * @param {string} id Id de l'utilisateur.
	 * @returns {Promise<?User>} Utilisateur trouvé ou `null`.
	 **/
	async getUserById(id) {
		const [rows] = await this.connection.query('SELECT * FROM User WHERE id = ?', [id]);
		if (rows.length === 0)
			return null;
		return new User(rows[0], this);
	}

	/**
	 * Récupère un utilisateur par son nom d'utilisateur.
	 * @param {string} username Nom de l'utilisateur.
	 * @returns {Promise<?User>} Utilisateur trouvé ou `null`.
	 **/
	async getUser(username) {
		const [rows] = await this.connection.query('SELECT * FROM User WHERE username= ? ', [username]);
		if (rows.length === 0)
			return null;
		return new User(rows[0], this);
	}

	/**
	 * Récupère tous les tweets envoyés sur le site.
	 * @param {boolean} includeDeleted S'il faut inclure les tweets supprimés (pour les admins).
	 * @returns {Promise<Tweet[]>} Tous les tweets.
	 */
	async getAllTweets(includeDeleted = false) {
		let [tweets] = await this.connection.query(
			'SELECT * FROM Tweet WHERE Tweet.replies_to IS NULL'
			+ (!includeDeleted ? ' AND Tweet.is_deleted = 0' : '')
			+ ' ORDER BY Tweet.created_at DESC'
		);
		if (includeDeleted) {
			tweets = tweets.filter(tweet => (tweet.content.startsWith('//RT:') && tweet.is_deleted === 0) || !tweet.content.startsWith('//RT:'));
		}
		return formatTweetList(tweets, this);
	}

	/**
	 * Récupère un tweet par son id.
	 * @param {string} id Id du tweet za récupérer. 
	 * @returns {Promise<?Tweet>} Tweet trouvé ou `null`.
	 */
	async getTweet(id) {
		const [rows] = await this.connection.query('SELECT * FROM Tweet WHERE id = ?', [id]);
		if (rows.length === 0)
			return null;
		const tweet = await instanciateTweet(rows[0], this);
		return tweet;
	}

	/**
	 * Insère un utilisateur dans la base de données.
	 * @param {object} data Donnés requises lors de la création de l'utilisateur.
	 * @param {string} data.username Nom d'utilisateur.
	 * @param {string} data.email Adresse email.
	 * @param {string} data.password Mot de passe, en clair.
	 * @returns {Promise<User>} L'utilisateur créé.
	 */
	async addUser(data) {
		const id = await this.generateId();
		const createdAt = new Date();
		const encrypted = await bcrypt.hash(data.password, 10);
		await this.connection.query('INSERT INTO User (id, username, email,  password, created_at, follows, followers, likes) VALUES (?, ?, ?, ?, ?, \'[]\', \'[]\', \'[]\')',
			[id, data.username, data.email, encrypted, createdAt]);
		await this.connection.query('INSERT INTO Id VALUES (?,?,?)', [id, createdAt, 0]);
		this.log.info(`[${id}] Compte de ${data.username} créé`);
		return new User({
			// Le constructeur User attend un objet brut sorti de la base de données.
			// On le simule ici.
			id,
			username: data.username,
			email: data.email,
			password: encrypted,
			created_at: createdAt,
			follows: [],
			followers: [],
			likes: []
		}, this);
	}

	/**
	 * Insère un tweet dans la base de données.
	 * @param {object} data Données du tweet lors de sa création
	 * @param {string} data.content Contenu du tweet.
	 * @param {string} data.authorId Id de l'auteur.
	 * @param {?string} data.imageId Id de l'image du tweet.
	 * @param {?string} data.repliesTo Id du tweet auquel ce tweet répond.
	 * @param {?string} data.repliesToUsername Nom d'utilisateur de l'auteur du tweet auquel ce tweet répond.
	 * @param {?string} data.id L'id du tweet, si généré au préalable (en cas de tweet avec image).
	 * @returns {Promise<Tweet>} Le tweet généré.
	 */
	async addTweet(data) {
		const id = data.id || await this.generateId();
		const createdAt = new Date();
		this.log.info(`Tweet ${id} créé`);
		await this.connection.query('INSERT INTO Id VALUES (?,?,?)', [id, createdAt, 1]);
		await this.connection.query('INSERT INTO Tweet VALUES (?, ?, ?, ?, ?, ?, ?, \'[]\', \'[]\', \'[]\', 0)',
			[id, data.content, data.authorId, data.imageId, createdAt, data.repliesTo, data.repliesToUsername]);
		return new Tweet({
			// Même procédé que pour addUser
			id,
			content: data.content,
			author_id: data.authorId,
			image_id: data.imageId,
			created_at: createdAt,
			replies_to: data.repliesTo,
			replies_to_username: data.repliesToUsername,
			likes: [],
			replies: [],
			retweets: []
		}, this);
	}

	/**
	 * Ajoute une image en base de données et dans l'arborescence.
	 * @param {string} path Chemin vers le fichier. 
	 * @param {object} data Données liées à l'image.
	 * @param {string} data.id Id de l'utilisateur ou du tweet lié à l'image.
	 * @param {string} data.type Type de l'image : Avatar, Banniére, ou Image de tweet.
	 * @returns {Promise<string>} Id de l'image.
	 */
	async addImage(path, data) {
		const id = await this.generateId();
		const createdAt = new Date();
		const dbType = (data.type === 'tweet') ? 2 : (data.type === 'banner') ? 1 : 0;
		const newPath = join(__dirname, '../../..', 'media', id + '.jpg');
		// rename déplace le fichier dans le dossier media.
		await rename(path, newPath);
		this.log.info(`Image ${id} sauvegardée.`);
		if (data.type === 'tweet')
			await this.connection.query('INSERT INTO Image VALUES (?, ?, 2, NULL, ?, ?, 0)', [id, newPath, data.id, createdAt]);
		else
			await this.connection.query('INSERT INTO Image VALUES (?, ?, ?, ?, NULL, ?, 0)', [id, newPath, dbType, data.id, createdAt]);
		await this.connection.query('INSERT INTO Id VALUES (?, ?, 2)', [id, createdAt]);
		return id;
	}
}

module.exports = new Database(process.env.DB_HOST, process.env.DB_USER, process.env.DB_PASSWORD);