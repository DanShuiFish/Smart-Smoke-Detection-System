f=open("src/main/java/com/smartsmoke/config/SaTokenConfig.java","r",encoding="utf-8").read()
target='            .notMatch("/api/auth/login")\n                    .check(r -> StpUtil.checkLogin());'
replacement='            .notMatch("/api/auth/login")\n                    .notMatch("/api/auth/register")\n                    .check(r -> StpUtil.checkLogin());'
f=f.replace(target,replacement)
open("src/main/java/com/smartsmoke/config/SaTokenConfig.java","w",encoding="utf-8").write(f)
print("OK")
