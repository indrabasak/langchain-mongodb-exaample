import { Db, MongoClient } from 'mongodb';
import fs from 'node:fs';

export class MongoUtil {
  private readonly dbName: string;
  private readonly url: string;
  private client: MongoClient | undefined;
  private db: Db | undefined;

  /**
   * Constructor to initialize the MongoDB connection.
   *
   * @param host  mongoDB host
   * @param port  mongoDB port
   * @param queryStr  mongoDB query string
   * @param dbName mongoDB database name
   * @param certPath mongoDB certificate path
   * @param user mongoDB user
   * @param pwd mongoDB password
   */
  constructor(
    host: string,
    port: number,
    queryStr: string,
    dbName: string,
    certPath: string,
    user: string,
    pwd: string,
  ) {
    console.log('host: ', host);
    console.log('port: ', port);
    console.log('queryStr: ', queryStr);
    console.log('dbName: ', dbName);
    console.log('certPath: ', certPath);
    console.log('user: ', user);
    console.log('pwd: ', pwd);

    if (!fs.existsSync(certPath)) {
      throw new Error(`Certificate file not found: ${certPath}`);
    }

    this.dbName = dbName;
    const userNameEncoded = encodeURIComponent(user);
    const pwdEncoded = encodeURIComponent(pwd);
    this.url = `mongodb://${userNameEncoded}:${pwdEncoded}@${host}:${port}?${queryStr}&tlsCAFile=${certPath}`;
  }

  /**
   * Connect to the MongoDB instance.
   */
  async connect() {
    this.client = await MongoClient.connect(this.url);
    await this.client.connect();
    this.db = this.client.db(this.dbName);

    return this.db;
  }

  getClient(): MongoClient | undefined {
    return this.client;
  }

  getDbName(): string {
    return this.dbName;
  }

  getDb(): Db | undefined {
    return this.db;
  }

  /**
   * Close the MongoDB connection.
   */
  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}
