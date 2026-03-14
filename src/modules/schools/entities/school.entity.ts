import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum SchoolStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Entity('school')
export class School {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'varchar', nullable: true })
  s3LogoKey: string | null;

  @Column({
    type: 'enum',
    enum: SchoolStatus,
    default: SchoolStatus.ACTIVE,
  })
  status: SchoolStatus;

  @CreateDateColumn()
  createdAt: Date;
}
