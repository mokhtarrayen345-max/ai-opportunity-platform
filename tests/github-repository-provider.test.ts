import {describe,it,expect,afterEach} from "vitest";
import {GitHubRepositoryProvider} from "@/services/github-repository-provider";
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;delete process.env.GITHUB_REPOSITORY_PROVIDER_ENABLED;delete process.env.GITHUB_TOKEN;delete process.env.GITHUB_ALLOWED_REPOSITORIES;});
describe("GitHub repository provider security",()=>{
 it("rejects arbitrary repositories when the application allowlist does not include them",async()=>{
  process.env.GITHUB_REPOSITORY_PROVIDER_ENABLED="true";process.env.GITHUB_TOKEN="test";process.env.GITHUB_ALLOWED_REPOSITORIES="allowed/repo";
  await expect(new GitHubRepositoryProvider().validateRepository("other/repo")).rejects.toThrow("not authorized");
 });
 it("validates a configured repository without exposing credentials",async()=>{
  process.env.GITHUB_REPOSITORY_PROVIDER_ENABLED="true";process.env.GITHUB_TOKEN="test";process.env.GITHUB_ALLOWED_REPOSITORIES="owner/repo";
  globalThis.fetch=async()=>new Response(JSON.stringify({full_name:"owner/repo",default_branch:"main",private:true}),{status:200});
  const result=await new GitHubRepositoryProvider().validateRepository("owner/repo");
  expect(result).toEqual({owner:"owner",name:"repo",fullName:"owner/repo",defaultBranch:"main",private:true});
 });
 it("rejects malformed identifiers",async()=>{
  process.env.GITHUB_REPOSITORY_PROVIDER_ENABLED="true";process.env.GITHUB_TOKEN="test";process.env.GITHUB_ALLOWED_REPOSITORIES="owner/repo";
  await expect(new GitHubRepositoryProvider().validateRepository("https://github.com/owner/repo")).rejects.toThrow();
 });
 it("fails closed when runtime credentials are unavailable",async()=>{
  process.env.GITHUB_REPOSITORY_PROVIDER_ENABLED="true";process.env.GITHUB_ALLOWED_REPOSITORIES="owner/repo";
  await expect(new GitHubRepositoryProvider().validateRepository("owner/repo")).rejects.toThrow("not securely configured");
 });
 it("creates only server-shaped repair branches",async()=>{
  process.env.GITHUB_REPOSITORY_PROVIDER_ENABLED="true";process.env.GITHUB_TOKEN="test";process.env.GITHUB_ALLOWED_REPOSITORIES="owner/repo";
  let calls=0;globalThis.fetch=async(_input,init)=>{calls++;if(calls===1)return new Response(JSON.stringify({object:{sha:"abc"}}),{status:200});return new Response(JSON.stringify({ref:"refs/heads/repair/ex1"}),{status:201});};
  await expect(new GitHubRepositoryProvider().createBranch("owner/repo","repair/ex1","main")).resolves.toEqual({ref:"refs/heads/repair/ex1"});
  await expect(new GitHubRepositoryProvider().createBranch("owner/repo","main","main")).rejects.toThrow("Unsafe repair branch.");
 });
});