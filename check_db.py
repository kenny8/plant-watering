from sqlalchemy import create_engine, text

DATABASE_URL = "mariadb+pymysql://user:m4Q8yrDETH@db:3306/plant_watering"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    print("=== Общее количество записей в device_data ===")
    result = conn.execute(text("SELECT COUNT(*) FROM device_data"))
    print(f"Total: {result.scalar()}")
    
    print("\n=== Записи по device_id=1 ===")
    result = conn.execute(text("SELECT COUNT(*) FROM device_data WHERE device_id=1"))
    print(f"device_id=1: {result.scalar()}")
    
    print("\n=== Записи по device_id=1 AND build_id=4 ===")
    result = conn.execute(text("SELECT COUNT(*) FROM device_data WHERE device_id=1 AND build_id=4"))
    print(f"device_id=1, build_id=4: {result.scalar()}")
    
    print("\n=== Записи по device_id=1 AND build_id=4 AND field_name='temp' ===")
    result = conn.execute(text("SELECT COUNT(*) FROM device_data WHERE device_id=1 AND build_id=4 AND field_name='temp'"))
    print(f"device_id=1, build_id=4, field='temp': {result.scalar()}")
    
    print("\n=== Записи по device_id=1 AND field_name='temp' (без build_id) ===")
    result = conn.execute(text("SELECT COUNT(*) FROM device_data WHERE device_id=1 AND field_name='temp'"))
    print(f"device_id=1, field='temp' (all builds): {result.scalar()}")
    
    print("\n=== Уникальные build_id для device_id=1 ===")
    result = conn.execute(text("SELECT DISTINCT build_id FROM device_data WHERE device_id=1"))
    builds = result.fetchall()
    print(f"Builds: {[r[0] for r in builds]}")
    
    print("\n=== Записи по каждому build_id для device_id=1 ===")
    for build_id in [r[0] for r in builds]:
        result = conn.execute(text(f"SELECT COUNT(*) FROM device_data WHERE device_id=1 AND build_id={build_id}"))
        print(f"  build_id={build_id}: {result.scalar()}")
