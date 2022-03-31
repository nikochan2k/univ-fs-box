import { NotFoundError } from "univ-fs";
import { BoxFileSystem } from "../BoxFileSystem";
import secret from "./secret-developer.json";

export const fs = new BoxFileSystem(
  "univ-fs-test",
  secret.boxAppSettings,
  secret.developerToken
);

export const setup = async () => {
  try {
    fs.del("/", { recursive: true, ignoreHook: true, force: true });
  } catch (e) {
    if (e.name !== NotFoundError.name) {
      throw e;
    }
  }
};
