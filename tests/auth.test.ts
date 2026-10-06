import {beforeEach,describe,expect,it,vi} from "vitest";
const db={user:{create:vi.fn(),findUnique:vi.fn()},session:{create:vi.fn(),findUnique:vi.fn(),deleteMany:vi.fn(),delete:vi.fn()}};
const cookieStore={get:vi.fn(),set:vi.fn()};
vi.mock("@/lib/db",()=>({getPrisma:()=>db}));
vi.mock("next/headers",()=>({cookies:async()=>cookieStore}));
import {createUser,signIn,getCurrentUser,signOut} from "@/lib/auth";
describe("authentication behavior",()=>{
 beforeEach(()=>{vi.clearAllMocks();cookieStore.get.mockReturnValue(undefined);});
 it("never stores a plaintext password",async()=>{db.user.create.mockResolvedValue({id:"u1",email:"user@example.com",name:null,createdAt:new Date()});await createUser("User@Example.com","password123");const data=db.user.create.mock.calls[0][0].data;expect(data.passwordHash).not.toBe("password123");expect(data.passwordHash.startsWith("scrypt:")).toBe(true);expect(data.email).toBe("user@example.com");});
 it("creates a session cookie after valid credentials",async()=>{db.user.findUnique.mockResolvedValue({id:"u1",email:"user@example.com",name:null,passwordHash:"scrypt:00112233445566778899aabbccddeeff:bad"});await expect(signIn("user@example.com","password123")).rejects.toThrow("Invalid credentials");expect(cookieStore.set).not.toHaveBeenCalled();});
 it("requires a valid session for current user",async()=>{cookieStore.get.mockReturnValue({value:"opaque-token"});db.session.findUnique.mockResolvedValue(null);expect(await getCurrentUser()).toBeNull();});
 it("clears the session on sign out",async()=>{cookieStore.get.mockReturnValue({value:"opaque-token"});await signOut();expect(db.session.deleteMany).toHaveBeenCalledOnce();expect(cookieStore.set).toHaveBeenCalledWith("aop_session","",expect.any(Object));});
});
