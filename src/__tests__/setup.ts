import { OnExists, OnNoParent, OnNotExist } from "univ-fs";
import { BoxFileSystem } from "../BoxFileSystem";
import secret from "./secret-developer.json";

export const fs = new BoxFileSystem(
  "univ-fs-test",
  secret.boxAppSettings,
  secret.developerToken
);

export const setup = async () => {
  const root = await fs.getDirectory("/");
  await root.rm({
    onNotExist: OnNotExist.Ignore,
    recursive: true,
    ignoreHook: true,
  });
  await root.mkdir({
    onExists: OnExists.Ignore,
    onNoParent: OnNoParent.Error,
    ignoreHook: true,
  });
};
