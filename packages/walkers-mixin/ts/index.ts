import { Type, Mode, Constructor, IRawRepo, Hash, isFile, decode } from '@es-git/core';
import { IObjectRepo, GitObject, CommitObject, TreeObject } from '@es-git/object-mixin';

export type HashAndCommitObject = {
  readonly hash : Hash
  readonly commit : CommitObject
}

export type HashModePath = {
  readonly hash : Hash
  readonly mode : Mode,
  readonly path : string[]
}

export interface IWalkersRepo {
  walkCommits(...hash : Hash[]) : AsyncIterableIterator<HashAndCommitObject>
  walkTree(hash : Hash, iterateFolders? : boolean) : AsyncIterableIterator<HashModePath>
}

export default function walkersMixin<T extends Constructor<IRawRepo & IObjectRepo>>(repo : T) : Constructor<IWalkersRepo> & T {
  return class WalkersRepo extends repo implements IWalkersRepo {
    constructor(...args : any[]){
      super(...args);
    }

    async *walkCommits(...hash : Hash[]) : AsyncIterableIterator<HashAndCommitObject> {
      const blob = await this.loadMetadata('shallow');
      const shallows = blob ? new Set(decode(blob).split('\n')) : null;

      const queue = hash;
      const visited = new Set<Hash>(queue);
      while(queue.length > 0){
        const hash = queue.shift();
        if(!hash) return;
        const commit = await super.loadObject(hash);
        if(!commit) throw new Error(`Could not find object ${hash}`);
        if(commit.type !== Type.commit) throw new Error(`Object is not a commit ${hash}`);
        yield {hash, commit};
        if (shallows && shallows.has(hash)) {
          commit.body.parents.length = 0;
        }
        for(const parent of commit.body.parents){
          if(visited.has(parent)) continue;
          visited.add(parent);
          queue.push(parent);
        }
      }
    }

    async *walkTree(hash : Hash, iterateFolders = false, parentPath: string[] = []) : AsyncIterableIterator<HashModePath> {
      const object = await super.loadObject(hash);
      if(!object) throw new Error(`Could not find object ${hash}`);
      if(object.type === Type.tree){
        for(const name of Object.keys(object.body)){
          const {mode, hash} = object.body[name];
          const path = [...parentPath, name];
          if(isFile(mode)){
            yield {mode, hash, path};
          }else if(!iterateFolders || (yield {mode, hash, path}) !== false){
            yield* this.walkTree(hash, iterateFolders, path);
          }
        }
      }
    }
  }
}