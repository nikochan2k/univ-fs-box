import BoxSDK from "box-node-sdk";
import BoxClient from "box-node-sdk/lib/box-client";
import {
  AbstractFileSystem,
  createError,
  Directory,
  File,
  FileSystemOptions,
  getParentPath,
  HeadOptions,
  isFileSystemError,
  joinPaths,
  NoModificationAllowedError,
  NotFoundError,
  NotReadableError,
  Options,
  Props,
  Stats,
  URLOptions,
} from "univ-fs";
import { BoxDirectory } from "./BoxDirectory";
import { BoxFile } from "./BoxFile";

export interface BoxAppAuth {
  passphrase: string;
  privateKey: string;
  publicKeyID: string;
}

export interface BoxCredentials {
  appAuth?: BoxAppAuth;
  clientID: string;
  clientSecret: string;
}

export interface Info {
  type: "file" | "folder";
  id: string;
  etag?: string;
  name: string;
}

export interface EntryInfo extends Info {
  size?: number;
  created_at?: string;
  modified_at?: string;
  trashed_at?: string;
  purged_at?: string;
  description?: string;
  item_status: "active" | "trashed" | "deleted";
  parent?: Info;
}

export class BoxFileSystem extends AbstractFileSystem {
  private readonly id: string;
  private readonly isBasicClient: boolean;
  private readonly sdk: BoxSDK;

  private client?: BoxClient;

  constructor(
    repository: string,
    credentials: BoxCredentials,
    developerTokenOrEnterpriseId: string,
    options?: FileSystemOptions
  ) {
    super(repository, options);
    this.id = developerTokenOrEnterpriseId;
    if (credentials.appAuth) {
      this.sdk = BoxSDK.getPreconfiguredInstance(credentials);
      this.isBasicClient = false;
    } else {
      this.sdk = new BoxSDK(credentials);
      this.isBasicClient = true;
    }
  }

  public _error(path: string, e: unknown, write: boolean) {
    if (isFileSystemError(e)) {
      return e;
    }

    let name: string;
    const code: number = (e as any).response?.statusCode; // eslint-disable-line
    if (code === 404) {
      name = NotFoundError.name;
    } else if (write) {
      name = NoModificationAllowedError.name;
    } else {
      name = NotReadableError.name;
    }
    return createError({
      name,
      repository: this.repository,
      path,
      e: e as any, // eslint-disable-line
    });
  }

  public async _getClient() {
    if (this.client) {
      return this.client;
    }

    if (this.isBasicClient) {
      this.client = this.sdk.getBasicClient(this.id);
    } else {
      this.client = this.sdk.getAppAuthClient("enterprise", this.id);
    }

    const dir = await this.getDirectory("/");
    await dir.mkdir({ ignoreHook: true, force: true, recursive: true });

    return this.client;
  }

  public _getDirectory(path: string): Promise<Directory> {
    return Promise.resolve(new BoxDirectory(this, path));
  }

  public _getFile(path: string): Promise<File> {
    return Promise.resolve(new BoxFile(this, path));
  }

  public _getFullPath(path: string) {
    let fullPath = "/";
    if (!path || path === "/") {
      fullPath += this.repository;
    } else {
      fullPath += joinPaths(this.repository, path, false);
    }
    return fullPath;
  }

  public async _getInfo(path: string): Promise<EntryInfo> {
    const fullPath = this._getFullPath(path);
    const info = await this._getInfoFromFullPath(fullPath);
    if (!info) {
      throw createError({
        name: NotFoundError.name,
        repository: this.repository,
        path,
      });
    }
    return info;
  }

  public async _getInfoFromFullPath(
    fullPath: string
  ): Promise<EntryInfo | undefined> {
    if (fullPath === "/") {
      return { id: "0", type: "folder", name: "", item_status: "active" };
    }

    const parentPath = getParentPath(fullPath);
    let parent = await this._getInfoFromFullPath(parentPath);
    const client = await this._getClient();
    const items = await client.folders.getItems(parent?.id);
    for (const e of items.entries) {
      const childPath = (parentPath === "/" ? "" : parentPath) + "/" + e.name;
      if (fullPath === childPath) {
        return e;
      }
    }
    return undefined;
  }

  public async _head(path: string, _options: HeadOptions): Promise<Stats> {
    const repository = this.repository;
    try {
      const info = await this._getInfo(path);
      if (info.item_status !== "active") {
        throw createError({
          name: NotFoundError.name,
          repository,
          path,
        });
      }
      const stats: Stats = info as any;
      const createdAt = info.created_at;
      const created = createdAt ? new Date(createdAt).getDate() : NaN;
      if (!isNaN(created)) {
        stats.created = created;
      }
      const modifiedAt = info["modified_at"];
      const modified = modifiedAt ? new Date(modifiedAt).getDate() : NaN;
      if (!isNaN(modified)) {
        stats.modified = modified;
      }
      if (info.type === "folder") {
        delete stats["size"];
      }

      return stats;
    } catch (e) {
      throw this._error(path, e, false);
    }
  }

  public async _patch(path: string, props: Props, _: Options): Promise<void> {
    if (props.created) {
      props["created_at"] = new Date(props.created).toISOString();
      delete props.created;
    }
    if (props.modified) {
      props["modified_at"] = new Date(props.modified).toISOString();
      delete props.modified;
    }

    delete props["fields"];
    const keys = Object.entries(props);
    const fields = keys.join(",");

    try {
      const client = await this._getClient();
      const info = await this._getInfo(path);
      const id = info.id;
      if (info.type === "file") {
        await client.files.update(id, { ...props, fields });
      } else {
        await client.folders.update(id, { ...props, fields });
      }
    } catch (e) {
      throw this._error(path, e, true);
    }
  }

  public async _toURL(
    path: string,
    _isDirectory: boolean,
    options?: URLOptions
  ): Promise<string> {
    options = { urlType: "GET", ...options };
    if (options.urlType !== "GET") {
      throw this._error(
        path,
        { message: `"${options.urlType}" is not supported` }, // eslint-disable-line
        false
      );
    }

    const info = await this._getInfo(path);
    const client = await this._getClient();
    return client.files.getDownloadURL(info.id);
  }

  public supportDirectory(): boolean {
    return true;
  }
}
