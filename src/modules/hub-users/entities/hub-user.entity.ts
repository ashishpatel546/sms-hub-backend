import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum HubUserRole {
  SYSTEM_ADMIN = 'system_admin',
  SCHOOL_OWNER = 'school_owner',
}

@Entity('hub_user')
export class HubUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: HubUserRole,
    default: HubUserRole.SCHOOL_OWNER,
  })
  role: HubUserRole;

  @Column({ type: 'int', nullable: true })
  schoolId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: true })
  isFirstLogin: boolean;
}
